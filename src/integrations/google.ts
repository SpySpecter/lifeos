import "server-only";
import { env } from "@/lib/env";
import { addDays, today } from "@/lib/time";
import { getToken, listProviders, postForm, renameToken, validAccessToken } from "@/lib/tokens";
import { fetchJson, type Integration } from "./core";

/**
 * gmail.modify statt gmail.readonly: nötig, damit die Mail-Sortierung Labels setzen, archivieren und in den Papierkorb legen kann.
 * calendar.events: Termine aus LifeOS anlegen. drive (statt drive.metadata.readonly): Drive aufräumen legt Dateien in den
 * Papierkorb – das geht für nicht von LifeOS angelegte Dateien nur mit dem vollen Scope. Endgültig gelöscht wird nie.
 */
export const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
export const CALENDAR_WRITE = "https://www.googleapis.com/auth/calendar.events";
export const DRIVE_WRITE = "https://www.googleapis.com/auth/drive";
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", CALENDAR_WRITE, GMAIL_MODIFY, DRIVE_WRITE];

/** Funktionen, die ein älteres Konto erst nach erneutem Verbinden kann (für die Einstellungen). */
export const SCOPE_FEATURES = [
  { scope: GMAIL_MODIFY, label: "Mail-Sortierung" },
  { scope: CALENDAR_WRITE, label: "Termine anlegen" },
  { scope: DRIVE_WRITE, label: "Drive aufräumen" },
] as const;

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO oder YYYY-MM-DD bei ganztägig
  end: string;
  allDay: boolean;
  calendar: string;
  color: string | null;
  location: string | null;
  url: string | null;
  account: string;
};
export type MailItem = { id: string; from: string; subject: string; snippet: string; date: string; url: string; account: string };
export type DriveFile = { id: string; name: string; mimeType: string; modified: string; url: string; account: string };
export type AccountMail = { account: string; unread: number; latest: MailItem[] };

export type GoogleData = {
  accounts: string[];
  events: CalendarEvent[];
  mail: AccountMail[];
  drive: DriveFile[];
  errors: { account: string; message: string }[];
};

export const googleRedirectUri = () => `${env().APP_URL}/api/auth/google/callback`;
export const googleKey = (email: string) => `google:${email.toLowerCase()}`;

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "select_account consent", // Kontoauswahl (mehrere Konten) + garantiert ein Refresh-Token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

export function exchangeGoogleCode(code: string) {
  return postForm<TokenResponse>("https://oauth2.googleapis.com/token", {
    code,
    client_id: env().GOOGLE_CLIENT_ID!,
    client_secret: env().GOOGLE_CLIENT_SECRET!,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
}

/** E-Mail-Adresse des Kontos (über Gmail, damit kein zusätzlicher Scope nötig ist). */
export async function googleEmail(accessToken: string): Promise<string> {
  const p = await fetchJson<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return p.emailAddress.toLowerCase();
}

export const googleAccessToken = (key: string) =>
  validAccessToken(key, (refreshToken) =>
    postForm<TokenResponse>("https://oauth2.googleapis.com/token", {
      refresh_token: refreshToken,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  );

/** Verbundene Konten (E-Mail-Adressen). Ein Token aus der Zeit vor Multi-Account (Schlüssel "google") wird umbenannt. */
export async function googleAccounts(): Promise<string[]> {
  if (getToken("google")) {
    try {
      const email = await googleEmail(await googleAccessToken("google"));
      renameToken("google", googleKey(email));
    } catch (err) {
      console.error("[google] Altes Konto konnte nicht übernommen werden", err);
    }
  }
  return listProviders("google:").map((p) => p.slice("google:".length));
}

export function hasScope(email: string, scope: string): boolean {
  return (getToken(googleKey(email))?.scope ?? "").split(" ").includes(scope);
}

export function missingFeatures(email: string): string[] {
  return SCOPE_FEATURES.filter((f) => !hasScope(email, f.scope)).map((f) => f.label);
}

async function api<T>(url: string, token: string): Promise<T> {
  return fetchJson<T>(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function fetchEvents(token: string, account: string): Promise<CalendarEvent[]> {
  const list = await api<{ items: { id: string; summary: string; selected?: boolean; backgroundColor?: string }[] }>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    token,
  );
  const calendars = list.items.filter((c) => c.selected !== false).slice(0, 8);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "25" });
      const res = await api<{
        items: {
          id: string;
          summary?: string;
          start: { dateTime?: string; date?: string };
          end: { dateTime?: string; date?: string };
          location?: string;
          htmlLink?: string;
          status?: string;
        }[];
      }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, token);
      return res.items
        .filter((e) => e.status !== "cancelled")
        .map((e) => ({
          id: `${account}:${e.id}`,
          title: e.summary ?? "(ohne Titel)",
          start: e.start.dateTime ?? e.start.date ?? "",
          end: e.end.dateTime ?? e.end.date ?? "",
          allDay: !e.start.dateTime,
          calendar: cal.summary,
          color: cal.backgroundColor ?? null,
          location: e.location ?? null,
          url: e.htmlLink ?? null,
          account,
        }));
    }),
  );
  return perCalendar.flat();
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  // Ganztägige Termine ("2026-10-12") vor Terminen mit Uhrzeit am selben Tag
  const key = (e: CalendarEvent) => (e.allDay ? `${e.start}T00:00:00` : new Date(e.start).toISOString());
  return [...events].sort((a, b) => key(a).localeCompare(key(b)));
}

export type WritableCalendar = { account: string; id: string; name: string; color: string | null; primary: boolean };

/** Kalender, in die LifeOS schreiben darf – über alle Konten mit `calendar.events`. */
export async function writableCalendars(): Promise<WritableCalendar[]> {
  const accounts = (await googleAccounts()).filter((a) => hasScope(a, CALENDAR_WRITE));
  const lists = await Promise.allSettled(
    accounts.map(async (account) => {
      const token = await googleAccessToken(googleKey(account));
      const list = await api<{ items: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }[] }>(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
        token,
      );
      return list.items.map((c) => ({
        account,
        id: c.id,
        name: c.summaryOverride ?? c.summary,
        color: c.backgroundColor ?? null,
        primary: Boolean(c.primary),
      }));
    }),
  );
  return lists.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export type NewEvent = {
  title: string;
  day: string; // YYYY-MM-DD
  start: string | null; // HH:MM, null = ganztägig
  end: string | null; // HH:MM
  endDay?: string | null; // bei ganztägigen Terminen über mehrere Tage (einschließlich)
  location?: string | null;
  note?: string | null;
};

/** Ende eines Termins mit Uhrzeit: fehlt es oder ist es gleich dem Start, dauert er 1 Stunde; liegt es davor, endet er am Folgetag. */
export function eventEnd(day: string, start: string, end: string | null): { day: string; time: string } {
  if (end && end > start) return { day, time: end };
  if (end && end < start) return { day: addDays(day, 1), time: end };
  const m = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + 60;
  const time = `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { day: m >= 24 * 60 ? addDays(day, 1) : day, time };
}

/** Request-Body für die Calendar API. Ganztägig: `date` mit exklusivem Ende; mit Uhrzeit: Wanduhrzeit + Zeitzone. */
export function eventBody(e: NewEvent, tz: string) {
  let time;
  if (e.start) {
    const end = eventEnd(e.day, e.start, e.end);
    time = { start: { dateTime: `${e.day}T${e.start}:00`, timeZone: tz }, end: { dateTime: `${end.day}T${end.time}:00`, timeZone: tz } };
  } else {
    time = { start: { date: e.day }, end: { date: addDays(e.endDay && e.endDay > e.day ? e.endDay : e.day, 1) } };
  }
  return {
    summary: e.title.trim(),
    ...(e.location?.trim() ? { location: e.location.trim() } : {}),
    ...(e.note?.trim() ? { description: e.note.trim() } : {}),
    ...time,
  };
}

export async function createCalendarEvent(account: string, calendarId: string, e: NewEvent): Promise<{ id: string; url: string | null }> {
  if (!hasScope(account, CALENDAR_WRITE)) throw new Error(`${account} neu verbinden, um Termine anzulegen`);
  const token = await googleAccessToken(googleKey(account));
  const res = await fetchJson<{ id: string; htmlLink?: string }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(e, env().APP_TZ)),
    },
  );
  return { id: res.id, url: res.htmlLink ?? null };
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** "Max Muster <max@example.com>" → "Max Muster" */
export function displayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<.+>\s*$/);
  return (m ? m[1] : from).trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchMail(token: string, account: string): Promise<AccountMail> {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const [inbox, list] = await Promise.all([
    api<{ messagesUnread: number }>(`${base}/labels/INBOX`, token),
    api<{ messages?: { id: string }[] }>(`${base}/messages?maxResults=6&q=${encodeURIComponent("is:unread in:inbox")}`, token),
  ]);
  const latest = await Promise.all(
    (list.messages ?? []).map(async ({ id }) => {
      const m = await api<{ id: string; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } }>(
        `${base}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        token,
      );
      return {
        id: m.id,
        from: displayName(header(m.payload.headers, "From")),
        subject: header(m.payload.headers, "Subject") || "(kein Betreff)",
        snippet: decodeEntities(m.snippet),
        date: new Date(Number(m.internalDate)).toISOString(),
        url: `https://mail.google.com/mail/u/${encodeURIComponent(account)}/#inbox/${m.id}`,
        account,
      };
    }),
  );
  return { account, unread: inbox.messagesUnread, latest };
}

async function fetchDrive(token: string, account: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    pageSize: "6",
    orderBy: "modifiedTime desc",
    q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const res = await api<{ files: { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    token,
  );
  return res.files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modified: f.modifiedTime, url: f.webViewLink, account }));
}

export const google: Integration<GoogleData> = {
  id: "google",
  ttlSeconds: 5 * 60,
  missingConfig: () => {
    if (!env().GOOGLE_CLIENT_ID || !env().GOOGLE_CLIENT_SECRET) {
      return { hint: "GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET in .env eintragen", connectHref: "/settings#google" };
    }
    if (!getToken("google") && !listProviders("google:").length) {
      return { hint: "Noch kein Google-Konto verbunden", connectHref: "/settings#google" };
    }
    return null;
  },
  async fetch() {
    const accounts = await googleAccounts();
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const token = await googleAccessToken(googleKey(account));
        const [events, mail, drive] = await Promise.all([
          fetchEvents(token, account),
          fetchMail(token, account),
          fetchDrive(token, account),
        ]);
        return { events, mail, drive };
      }),
    );
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const errors = results.flatMap((r, i) =>
      r.status === "rejected" ? [{ account: accounts[i], message: r.reason instanceof Error ? r.reason.message : "Fehler" }] : [],
    );
    if (!ok.length && errors.length) throw new Error(errors.map((e) => `${e.account}: ${e.message}`).join("; "));
    return {
      accounts,
      events: sortEvents(ok.flatMap((r) => r.events)).slice(0, 30),
      mail: ok.map((r) => r.mail),
      drive: ok
        .flatMap((r) => r.drive)
        .sort((a, b) => b.modified.localeCompare(a.modified))
        .slice(0, 6),
      errors,
    };
  },
  mock() {
    const d = today();
    const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const me = "luis@example.com";
    const school = "luis@schule.example";
    return {
      accounts: [me, school],
      events: [
        { id: "1", title: "Fahrstunde", start: at(d, "16:30"), end: at(d, "18:00"), allDay: false, calendar: "Privat", color: "#16a765", location: "Fahrschule Mitte", url: null, account: me },
        { id: "2", title: "Bandprobe", start: at(d, "19:00"), end: at(d, "21:00"), allDay: false, calendar: "Privat", color: "#16a765", location: null, url: null, account: me },
        { id: "3", title: "Mathe-Klausur", start: addDays(d, 2), end: addDays(d, 3), allDay: true, calendar: "Schule", color: "#4986e7", location: null, url: null, account: school },
        { id: "4", title: "Geburtstag Oma", start: addDays(d, 3), end: addDays(d, 4), allDay: true, calendar: "Familie", color: "#f691b2", location: null, url: null, account: me },
        { id: "5", title: "Zahnarzt", start: at(addDays(d, 4), "08:15"), end: at(addDays(d, 4), "09:00"), allDay: false, calendar: "Privat", color: "#16a765", location: "Praxis Dr. Weiß", url: null, account: me },
      ],
      mail: [
        {
          account: me,
          unread: 4,
          latest: [
            { id: "b", from: "GitHub", subject: "[SpySpecter/lifeos] CI passed on main", snippet: "All checks have passed.", date: ago(120), url: "#", account: me },
            { id: "c", from: "Fahrschule Mitte", subject: "Terminbestätigung", snippet: "Deine nächste Fahrstunde ist heute um 16:30 Uhr.", date: ago(300), url: "#", account: me },
          ],
        },
        {
          account: school,
          unread: 3,
          latest: [
            { id: "a", from: "Schulleitung", subject: "Elternbrief: Projektwoche", snippet: "Liebe Schülerinnen und Schüler, in der Woche vor den Ferien …", date: ago(35), url: "#", account: school },
          ],
        },
      ],
      drive: [
        { id: "x", name: "Referat Klimapolitik", mimeType: "application/vnd.google-apps.presentation", modified: ago(60), url: "#", account: school },
        { id: "y", name: "Mathe Zusammenfassung Analysis", mimeType: "application/vnd.google-apps.document", modified: ago(400), url: "#", account: me },
        { id: "z", name: "Budget Herbst", mimeType: "application/vnd.google-apps.spreadsheet", modified: ago(1500), url: "#", account: me },
      ],
      errors: [],
    };
  },
};
