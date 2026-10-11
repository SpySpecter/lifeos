import "server-only";
import { WebUntis, type Lesson } from "webuntis";
import { env } from "@/lib/env";
import { addDays, today } from "@/lib/time";
import type { Integration } from "./core";

export type LessonStatus = "regular" | "cancelled" | "irregular";

export type SchoolLesson = {
  day: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  subject: string;
  subjectLong: string | null;
  teachers: string[];
  rooms: string[];
  status: LessonStatus;
  note: string | null;
};

export type SchoolWeek = { days: { day: string; lessons: SchoolLesson[] }[]; changes: SchoolLesson[] };

const pad = (n: number) => String(n).padStart(2, "0");
const untisTime = (t: number) => `${pad(Math.floor(t / 100))}:${pad(t % 100)}`;
const untisDay = (d: number) => {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

/** Gleiche Abbildung wie der frühere Untis-MCP-Server (my-assistant/integrations/untis/server.py). */
export function mapLesson(l: Lesson): SchoolLesson {
  const notes = [l.substText, l.info, l.lstext].filter((s): s is string => Boolean(s && s.trim()));
  return {
    day: untisDay(l.date),
    start: untisTime(l.startTime),
    end: untisTime(l.endTime),
    subject: l.su[0]?.name ?? l.lstext ?? "—",
    subjectLong: l.su[0]?.longname ?? null,
    teachers: l.te.map((t) => t.name).filter(Boolean),
    rooms: l.ro.map((r) => r.name).filter(Boolean),
    status: l.code ?? "regular",
    note: notes.length ? notes.join(" · ") : null,
  };
}

/** Doppelstunden zusammenfassen: gleiches Fach, gleicher Status, direkt anschließend. */
export function mergeBlocks(lessons: SchoolLesson[]): SchoolLesson[] {
  const sorted = [...lessons].sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
  const out: SchoolLesson[] = [];
  for (const l of sorted) {
    const prev = out[out.length - 1];
    const gapOk = prev && prev.day === l.day && minutes(l.start) - minutes(prev.end) <= 10;
    if (prev && gapOk && prev.subject === l.subject && prev.status === l.status && prev.rooms.join() === l.rooms.join()) {
      prev.end = l.end;
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function buildWeek(lessons: SchoolLesson[], from: string, days: number): SchoolWeek {
  const merged = mergeBlocks(lessons);
  return {
    days: Array.from({ length: days }, (_, i) => addDays(from, i)).map((day) => ({
      day,
      lessons: merged.filter((l) => l.day === day),
    })),
    changes: merged.filter((l) => l.status !== "regular"),
  };
}

export const untis: Integration<SchoolWeek> = {
  id: "untis",
  ttlSeconds: 15 * 60,
  missingConfig: () => {
    const e = env();
    return e.UNTIS_SERVER && e.UNTIS_SCHOOL && e.UNTIS_USER && e.UNTIS_PASSWORD
      ? null
      : { hint: "UNTIS_SERVER, UNTIS_SCHOOL, UNTIS_USER und UNTIS_PASSWORD in .env eintragen", connectHref: "/settings#untis" };
  },
  async fetch() {
    const e = env();
    const session = new WebUntis(e.UNTIS_SCHOOL!, e.UNTIS_USER!, e.UNTIS_PASSWORD!, e.UNTIS_SERVER!, "lifeos");
    await session.login();
    try {
      const from = today(e.APP_TZ);
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${addDays(from, 6)}T23:59:59`);
      const lessons = await session.getOwnTimetableForRange(start, end);
      return buildWeek(lessons.map(mapLesson), from, 7);
    } finally {
      await session.logout().catch(() => undefined);
    }
  },
  mock() {
    const d = today();
    const L = (
      day: string,
      start: string,
      end: string,
      subject: string,
      subjectLong: string,
      room: string,
      teacher: string,
      status: LessonStatus = "regular",
      note: string | null = null,
    ): SchoolLesson => ({ day, start, end, subject, subjectLong, teachers: [teacher], rooms: [room], status, note });
    const t = addDays(d, 1);
    const lessons = [
      L(d, "07:45", "09:15", "M", "Mathematik", "A204", "Kr"),
      L(d, "09:35", "11:05", "INF", "Informatik", "PC2", "Hb"),
      L(d, "11:25", "12:10", "E", "Englisch", "B103", "Sm", "cancelled", "Entfall wegen Fortbildung"),
      L(d, "12:15", "13:00", "D", "Deutsch", "B103", "Lu"),
      L(d, "13:45", "15:15", "SP", "Sport", "Halle 1", "Wb", "irregular", "Vertretung: Hr. Klein"),
      L(t, "07:45", "09:15", "PH", "Physik", "N012", "Fi"),
      L(t, "09:35", "11:05", "M", "Mathematik", "A204", "Kr"),
      L(t, "11:25", "13:00", "GE", "Geschichte", "B210", "Ot"),
      L(addDays(d, 2), "07:45", "09:15", "INF", "Informatik", "PC2", "Hb", "irregular", "Raumänderung: PC1"),
      L(addDays(d, 2), "09:35", "11:05", "E", "Englisch", "B103", "Sm"),
    ];
    return buildWeek(lessons, d, 7);
  },
};
