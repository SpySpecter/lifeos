import "server-only";
import { z } from "zod";
import {
  fetchExams,
  fetchHomework,
  fetchLessons,
  type SchoolExam,
  type SchoolHomework,
  type SchoolLesson,
  untis,
} from "@/integrations/untis";
import { cached } from "@/lib/cache";
import { parseCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { env, isDemo } from "@/lib/env";
import { addDays, today } from "@/lib/time";
import { defineTool, type McpServerInfo } from "./server";

export const MAX_RANGE_DAYS = 31;
const EXAM_RANGE_DAYS = 180;

export const UNTIS_SERVER_INFO: McpServerInfo = {
  name: "lifeos-untis",
  version: "1.0.0",
  instructions:
    "Stundenplan von Luis aus WebUntis (Oberstufe, Kurse wie 'LK If 1' = Informatik-Leistungskurs, 'SK' = Seminarkurs, 'PB' = Politische Bildung). " +
    "Für alle Fragen zu Stunden, Räumen, Ausfällen und Vertretungen diese Tools nutzen – nicht den Google-Kalender. " +
    "Klausurtermine stehen zusätzlich im Google-Kalender als '📝 Klausur: <Kurs>', falls Untis Prüfungen nicht freigibt. Daten in Europe/Berlin.",
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");

function span(from: string, to: string, max: number): number {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  if (days < 0) throw new Error("date_to liegt vor date_from");
  if (days > max) throw new Error(`Zeitraum zu groß (höchstens ${max} Tage)`);
  return days;
}

function ensureConfigured() {
  const missing = untis.missingConfig();
  if (missing) throw new Error(`Untis ist nicht eingerichtet: ${missing.hint}`);
}

/** Lesbarer Kursname zusätzlich zum Untis-Kürzel. */
const describe = (l: SchoolLesson) => {
  const c = parseCourse(l.subject);
  return {
    day: l.day,
    start: l.start,
    end: l.end,
    course: l.subject,
    // manche Schulen tragen als Langname nur das Kürzel ein
    subject: l.subjectLong && l.subjectLong !== l.subject ? l.subjectLong : c.title,
    kind: c.kind,
    rooms: l.rooms,
    teachers: l.teachers,
    status: l.status === "cancelled" ? "entfällt" : l.status === "irregular" ? "geändert/Vertretung" : "regulär",
    note: l.note,
  };
};

async function lessons(from: string, to: string): Promise<SchoolLesson[]> {
  if (isDemo()) return untis.mock().days.flatMap((d) => d.lessons).filter((l) => l.day >= from && l.day <= to);
  ensureConfigured();
  return (await cached(db(), `untis:mcp:lessons:${from}:${to}`, 15 * 60, () => fetchLessons(from, to))).data;
}

const now = () => today(env().APP_TZ);

/** Viele Schulen sperren Prüfungen/Hausaufgaben für Schülerkonten – dann eine verständliche Meldung statt "403". */
async function unlessForbidden<T>(what: string, hint: string, fn: () => Promise<T>): Promise<T | string> {
  try {
    return await fn();
  } catch (err) {
    if (/status code 40[13]|forbidden|no right/i.test((err as Error).message)) return `Die Schule gibt ${what} in Untis für dieses Konto nicht frei. ${hint}`;
    throw err;
  }
}

export const untisTools = [
  defineTool({
    name: "get_today",
    description: "Heutige Schulstunden (mit Raum, Status Entfall/Vertretung und Hinweisen).",
    input: z.object({}),
    async run() {
      const d = now();
      return { date: d, lessons: (await lessons(d, d)).map(describe) };
    },
  }),
  defineTool({
    name: "get_timetable",
    description: `Eigener Stundenplan zwischen zwei Daten (inklusive, höchstens ${MAX_RANGE_DAYS} Tage). Ohne date_to nur ein Tag.`,
    input: z.object({ date_from: isoDay.describe("Erster Tag, YYYY-MM-DD"), date_to: isoDay.optional().describe("Letzter Tag, YYYY-MM-DD") }),
    async run({ date_from, date_to }) {
      const to = date_to ?? date_from;
      span(date_from, to, MAX_RANGE_DAYS);
      const all = await lessons(date_from, to);
      const days = [...new Set(all.map((l) => l.day))].sort();
      return days.map((day) => ({ day, lessons: all.filter((l) => l.day === day).map(describe) }));
    },
  }),
  defineTool({
    name: "get_changes",
    description: "Ausfälle, Vertretungen und Raumänderungen in den nächsten Tagen.",
    input: z.object({ days: z.number().int().min(1).max(MAX_RANGE_DAYS).default(7).describe("Anzahl Tage ab heute") }),
    async run({ days }) {
      const d = now();
      const changed = (await lessons(d, addDays(d, days))).filter((l) => l.status !== "regular");
      return changed.length ? changed.map(describe) : "Keine Ausfälle oder Vertretungen im Zeitraum.";
    },
  }),
  defineTool({
    name: "get_exams",
    description: "Klausuren/Prüfungen aus Untis (falls die Schule sie freigibt). Standard: die nächsten 8 Wochen.",
    input: z.object({ date_from: isoDay.optional(), date_to: isoDay.optional() }),
    async run({ date_from, date_to }) {
      const from = date_from ?? now();
      const to = date_to ?? addDays(from, 56);
      span(from, to, EXAM_RANGE_DAYS);
      if (isDemo()) return [{ day: addDays(from, 9), start: "08:00", end: "10:15", subject: "LK Ma 1", type: "Klausur", name: "Analysis", rooms: ["A204"], text: null }] satisfies SchoolExam[];
      ensureConfigured();
      return unlessForbidden("Prüfungen", "Klausurtermine stehen im Google-Kalender als „📝 Klausur: …“.", async () => {
        const exams = (await cached(db(), `untis:mcp:exams:${from}:${to}`, 60 * 60, () => fetchExams(from, to))).data;
        return exams.length ? exams.map((x) => ({ ...x, subjectName: parseCourse(x.subject).title })) : "Untis meldet keine Prüfungen im Zeitraum.";
      });
    },
  }),
  defineTool({
    name: "get_homework",
    description: "Hausaufgaben aus Untis (falls die Lehrkräfte sie eintragen). Standard: letzte 7 bis nächste 14 Tage.",
    input: z.object({ date_from: isoDay.optional(), date_to: isoDay.optional() }),
    async run({ date_from, date_to }) {
      const from = date_from ?? addDays(now(), -7);
      const to = date_to ?? addDays(now(), 14);
      span(from, to, 60);
      if (isDemo()) return [{ assigned: from, due: addDays(from, 9), subject: "GK De 2", text: "Gedichtanalyse fertigstellen", completed: false }] satisfies SchoolHomework[];
      ensureConfigured();
      return unlessForbidden("Hausaufgaben", "Hinweise der Lehrkräfte stehen teils im Feld „note“ der Stunden (get_timetable).", async () => {
        const hw = (await cached(db(), `untis:mcp:homework:${from}:${to}`, 30 * 60, () => fetchHomework(from, to))).data;
        return hw.length ? hw : "Untis meldet keine Hausaufgaben im Zeitraum.";
      });
    },
  }),
];
