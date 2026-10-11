import "server-only";
import { parseCourse } from "@/lib/courses";
import { env } from "@/lib/env";
import { addDays, dayString, today } from "@/lib/time";
import { fetchJson, type Integration } from "./core";
import { google, googleAccessToken, googleAccounts, googleKey } from "./google";

/**
 * Klausuren & Tests aus Google Calendar. Untis gibt Prüfungen für Schülerkonten oft nicht frei,
 * deshalb gelten Termine mit "Klausur", "Test" oder "Prüfung" im Titel als Prüfung.
 */

export type ExamKind = "Klausur" | "Test" | "Prüfung";

export type Exam = {
  id: string;
  kind: ExamKind;
  /** z. B. "Mathematik" oder "Geschichtstest" */
  label: string;
  /** "LK" / "GK" / "Seminarkurs" bei Untis-Kursnamen */
  course: string | null;
  topic: string | null;
  day: string; // YYYY-MM-DD (lokal)
  start: string | null; // HH:MM, null bei ganztägig
  end: string | null;
  /** z. B. "Std 1–3" aus der Terminbeschreibung */
  detail: string | null;
  url: string | null;
};

const EXAM_RE = /(klausur|prüfung|abitur|\btest\b|\w+test\b|\blek\b)/i;
export const isExam = (title: string) => EXAM_RE.test(title);

const kindOf = (title: string): ExamKind => (/klausur/i.test(title) ? "Klausur" : /prüfung|abitur/i.test(title) ? "Prüfung" : "Test");

/** "📝 Klausur: LK Ma 1" → Mathematik/LK; "Geschichtstest: Frühparlamentarismus" → Geschichtstest + Thema. */
export function parseExamTitle(raw: string): Pick<Exam, "kind" | "label" | "course" | "topic"> {
  const title = raw.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const kind = kindOf(title);
  const [head, ...rest] = title.split(":");
  const tail = rest.join(":").trim() || null;
  if (/^(klausur|test|prüfung|lek)$/i.test(head.trim()) && tail) {
    const c = parseCourse(tail);
    return c.kind ? { kind, label: c.title, course: c.kind, topic: null } : { kind, label: tail, course: null, topic: null };
  }
  return { kind, label: head.trim(), course: null, topic: tail };
}

export function examDetail(description: string | undefined): string | null {
  const m = description?.match(/Std\.?\s*\d+(?:\s*[–-]\s*\d+)?/);
  return m ? m[0].replace(/\s+/g, " ").replace("-", "–") : null;
}

export function daysUntil(day: string, from: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

type RawEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

const hhmm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));

export function toExam(e: RawEvent, tz: string): Exam {
  const allDay = !e.start.dateTime;
  return {
    id: e.id,
    ...parseExamTitle(e.summary ?? ""),
    day: allDay ? e.start.date! : dayString(new Date(e.start.dateTime!), tz),
    start: allDay ? null : hhmm(e.start.dateTime!, tz),
    end: allDay || !e.end.dateTime ? null : hhmm(e.end.dateTime, tz),
    detail: examDetail(e.description),
    url: e.htmlLink ?? null,
  };
}

/** Ab heute, sortiert, doppelte Einträge (gleicher Tag + Fach, z. B. aus zwei Kalendern) nur einmal. */
export function upcoming(list: Exam[], from: string): Exam[] {
  const byKey = new Map<string, Exam>();
  for (const x of list) if (x.day >= from && !byKey.has(`${x.day}|${x.label}`)) byKey.set(`${x.day}|${x.label}`, x);
  return [...byKey.values()].sort((a, b) => `${a.day}${a.start ?? ""}`.localeCompare(`${b.day}${b.start ?? ""}`));
}

const HORIZON_DAYS = 180;

async function fetchAccount(account: string): Promise<RawEvent[]> {
  const token = await googleAccessToken(googleKey(account));
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const list = await fetchJson<{ items: { id: string; selected?: boolean }[] }>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    auth,
  );
  const params = new URLSearchParams({
    timeMin: new Date(Date.now() - 12 * 3_600_000).toISOString(),
    timeMax: new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const perCalendar = await Promise.all(
    list.items
      .filter((c) => c.selected !== false && !c.id.includes("#holiday@"))
      .slice(0, 8)
      .map(async (c) => {
        const res = await fetchJson<{ items: RawEvent[] }>(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${params}`,
          auth,
        );
        return res.items.filter((e) => e.status !== "cancelled" && isExam(e.summary ?? ""));
      }),
  );
  return perCalendar.flat();
}

export const exams: Integration<Exam[]> = {
  id: "exams",
  ttlSeconds: 30 * 60,
  missingConfig: () => google.missingConfig(),
  async fetch() {
    const tz = env().APP_TZ;
    const results = await Promise.allSettled((await googleAccounts()).map(fetchAccount));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!ok.length && results.some((r) => r.status === "rejected")) {
      throw (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
    }
    return upcoming(ok.map((e) => toExam(e, tz)), today(tz));
  },
  mock() {
    const d = today();
    const E = (n: number, title: string, start: string | null, end: string | null, detail: string | null = null): Exam => ({
      id: `demo-${n}`,
      ...parseExamTitle(title),
      day: addDays(d, n),
      start,
      end,
      detail,
      url: null,
    });
    return [
      E(2, "Geschichtstest: Weimarer Republik", "09:50", "11:20"),
      E(9, "📝 Klausur: LK Ma 1", "08:00", "10:15", "Std 1–3"),
      E(16, "📝 Klausur: GK En 2", "08:00", "09:30", "Std 1–2"),
      E(23, "📝 Klausur: LK If 1", "09:50", "12:05", "Std 3–5"),
    ];
  },
};
