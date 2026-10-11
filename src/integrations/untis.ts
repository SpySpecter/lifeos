import "server-only";
import { type Exam, type Lesson, WebUntis } from "webuntis";
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

const names = (list: { name?: string }[] | undefined) => (list ?? []).map((x) => x.name ?? "").filter(Boolean);

/**
 * Gleiche Abbildung wie der frühere Untis-MCP-Server (my-assistant/integrations/untis/server.py).
 * Viele Schulen blenden für Schülerkonten Lehrer (`te`) komplett aus, daher sind alle Listen optional.
 */
export function mapLesson(l: Lesson): SchoolLesson {
  const notes = [l.substText, l.info, l.lstext].filter((s): s is string => Boolean(s && s.trim()));
  return {
    day: untisDay(l.date),
    start: untisTime(l.startTime),
    end: untisTime(l.endTime),
    subject: l.su?.[0]?.name ?? l.lstext ?? "—",
    subjectLong: l.su?.[0]?.longname ?? null,
    teachers: names(l.te),
    rooms: names(l.ro),
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

/** Mit Untis anmelden, `fn` ausführen, immer wieder abmelden. */
export async function withUntis<T>(fn: (s: WebUntis) => Promise<T>): Promise<T> {
  const e = env();
  const session = new WebUntis(e.UNTIS_SCHOOL!, e.UNTIS_USER!, e.UNTIS_PASSWORD!, e.UNTIS_SERVER!, "lifeos");
  await session.login();
  try {
    return await fn(session);
  } finally {
    await session.logout().catch(() => undefined);
  }
}

const rangeDates = (from: string, to: string) => [new Date(`${from}T00:00:00`), new Date(`${to}T23:59:59`)] as const;

/** Eigene Stunden im Zeitraum (YYYY-MM-DD, inklusive), Doppelstunden zusammengefasst. */
export async function fetchLessons(from: string, to: string): Promise<SchoolLesson[]> {
  const [start, end] = rangeDates(from, to);
  return mergeBlocks((await withUntis((s) => s.getOwnTimetableForRange(start, end))).map(mapLesson));
}

export type SchoolExam = { day: string; start: string; end: string; subject: string; type: string; name: string; rooms: string[]; text: string | null };

export function mapExam(x: Exam): SchoolExam {
  return {
    day: untisDay(x.examDate),
    start: untisTime(x.startTime),
    end: untisTime(x.endTime),
    subject: x.subject,
    type: x.examType,
    name: x.name,
    rooms: x.rooms ?? [],
    text: x.text?.trim() || null,
  };
}

export async function fetchExams(from: string, to: string): Promise<SchoolExam[]> {
  const [start, end] = rangeDates(from, to);
  return (await withUntis((s) => s.getExamsForRange(start, end))).map(mapExam).sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
}

export type SchoolHomework = { assigned: string; due: string; subject: string | null; text: string; completed: boolean };

type HomeworkResponse = {
  homeworks?: { lessonId: number; date: number; dueDate: number; text: string; remark?: string; completed: boolean }[];
  lessons?: { id: number; subject?: string }[];
};

export function mapHomework(res: HomeworkResponse): SchoolHomework[] {
  const subjects = new Map((res.lessons ?? []).map((l) => [l.id, l.subject ?? null]));
  return (res.homeworks ?? [])
    .map((h) => ({
      assigned: untisDay(h.date),
      due: untisDay(h.dueDate),
      subject: subjects.get(h.lessonId) ?? null,
      text: [h.text, h.remark].filter((t) => t && t.trim()).join(" – "),
      completed: Boolean(h.completed),
    }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export async function fetchHomework(from: string, to: string): Promise<SchoolHomework[]> {
  const [start, end] = rangeDates(from, to);
  return mapHomework((await withUntis((s) => s.getHomeWorkAndLessons(start, end))) as unknown as HomeworkResponse);
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
    const from = today(env().APP_TZ);
    return buildWeek(await fetchLessons(from, addDays(from, 6)), from, 7);
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
