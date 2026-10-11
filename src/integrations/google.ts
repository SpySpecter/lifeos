import "server-only";
import { env } from "@/lib/env";
import { addDays, today } from "@/lib/time";
import { getToken, postForm, validAccessToken } from "@/lib/tokens";
import { fetchJson, type Integration } from "./core";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

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
};
export type MailItem = { id: string; from: string; subject: string; snippet: string; date: string; url: string };
export type DriveFile = { id: string; name: string; mimeType: string; modified: string; url: string };

export type GoogleData = {
  events: CalendarEvent[];
  mail: { unread: number; latest: MailItem[] };
  drive: DriveFile[];
};

export const googleRedirectUri = () => `${env().APP_URL}/api/auth/google/callback`;

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // garantiert ein Refresh-Token
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

const accessToken = () =>
  validAccessToken("google", (refreshToken) =>
    postForm<TokenResponse>("https://oauth2.googleapis.com/token", {
      refresh_token: refreshToken,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  );

async function api<T>(url: string, token: string): Promise<T> {
  return fetchJson<T>(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function fetchEvents(token: string): Promise<CalendarEvent[]> {
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
          id: e.id,
          title: e.summary ?? "(ohne Titel)",
          start: e.start.dateTime ?? e.start.date ?? "",
          end: e.end.dateTime ?? e.end.date ?? "",
          allDay: !e.start.dateTime,
          calendar: cal.summary,
          color: cal.backgroundColor ?? null,
          location: e.location ?? null,
          url: e.htmlLink ?? null,
        }));
    }),
  );
  return sortEvents(perCalendar.flat()).slice(0, 30);
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  // Ganztägige Termine ("2026-10-12") vor Terminen mit Uhrzeit am selben Tag
  const key = (e: CalendarEvent) => (e.allDay ? `${e.start}T00:00:00` : new Date(e.start).toISOString());
  return [...events].sort((a, b) => key(a).localeCompare(key(b)));
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** "Max Muster <max@example.com>" → "Max Muster" */
export function displayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<.+>\s*$/);
  return (m ? m[1] : from).trim();
}

async function fetchMail(token: string): Promise<GoogleData["mail"]> {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const [inbox, list] = await Promise.all([
    api<{ messagesUnread: number }>(`${base}/labels/INBOX`, token),
    api<{ messages?: { id: string }[] }>(`${base}/messages?maxResults=5&q=${encodeURIComponent("is:unread in:inbox")}`, token),
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
        url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
      };
    }),
  );
  return { unread: inbox.messagesUnread, latest };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchDrive(token: string): Promise<DriveFile[]> {
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
  return res.files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modified: f.modifiedTime, url: f.webViewLink }));
}

export const google: Integration<GoogleData> = {
  id: "google",
  ttlSeconds: 5 * 60,
  missingConfig: () => {
    if (!env().GOOGLE_CLIENT_ID || !env().GOOGLE_CLIENT_SECRET) {
      return { hint: "GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET in .env eintragen", connectHref: "/settings#google" };
    }
    if (!getToken("google")) return { hint: "Google-Konto noch nicht verbunden", connectHref: "/settings#google" };
    return null;
  },
  async fetch() {
    const token = await accessToken();
    const [events, mail, drive] = await Promise.all([fetchEvents(token), fetchMail(token), fetchDrive(token)]);
    return { events, mail, drive };
  },
  mock() {
    const d = today();
    const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    return {
      events: [
        { id: "1", title: "Fahrstunde", start: at(d, "16:30"), end: at(d, "18:00"), allDay: false, calendar: "Privat", color: "#16a765", location: "Fahrschule Mitte", url: null },
        { id: "2", title: "Bandprobe", start: at(d, "19:00"), end: at(d, "21:00"), allDay: false, calendar: "Privat", color: "#16a765", location: null, url: null },
        { id: "3", title: "Mathe-Klausur", start: addDays(d, 2), end: addDays(d, 3), allDay: true, calendar: "Schule", color: "#4986e7", location: null, url: null },
        { id: "4", title: "Geburtstag Oma", start: addDays(d, 3), end: addDays(d, 4), allDay: true, calendar: "Familie", color: "#f691b2", location: null, url: null },
        { id: "5", title: "Zahnarzt", start: at(addDays(d, 4), "08:15"), end: at(addDays(d, 4), "09:00"), allDay: false, calendar: "Privat", color: "#16a765", location: "Praxis Dr. Weiß", url: null },
      ],
      mail: {
        unread: 7,
        latest: [
          { id: "a", from: "Schulleitung", subject: "Elternbrief: Projektwoche", snippet: "Liebe Schülerinnen und Schüler, in der Woche vor den Ferien …", date: ago(35), url: "#" },
          { id: "b", from: "GitHub", subject: "[SpySpecter/lifeos] CI passed on main", snippet: "All checks have passed.", date: ago(120), url: "#" },
          { id: "c", from: "Fahrschule Mitte", subject: "Terminbestätigung", snippet: "Deine nächste Fahrstunde ist heute um 16:30 Uhr.", date: ago(300), url: "#" },
        ],
      },
      drive: [
        { id: "x", name: "Referat Klimapolitik", mimeType: "application/vnd.google-apps.presentation", modified: ago(60), url: "#" },
        { id: "y", name: "Mathe Zusammenfassung Analysis", mimeType: "application/vnd.google-apps.document", modified: ago(400), url: "#" },
        { id: "z", name: "Budget Herbst", mimeType: "application/vnd.google-apps.spreadsheet", modified: ago(1500), url: "#" },
      ],
    };
  },
};
