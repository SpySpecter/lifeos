import "server-only";
import type { DB } from "./db";
import { structuredCompletion } from "./openai";
import { addDays, formatDayLong, localClock } from "./time";

/**
 * Schnelleingabe: „morgen 17 Uhr Mathe lernen“ oder „Zahnarzt Freitag 8:15 bis 9“ → ausgefülltes Formular.
 * Die KI füllt nur vor; gespeichert wird erst, wenn Luis im Formular auf „Hinzufügen“ tippt.
 */

export const REMIND_BEFORE = [0, 10, 30, 60, 1440] as const; // Minuten; 0 = keine
export type RemindBefore = (typeof REMIND_BEFORE)[number];

export type QuickEntry = {
  kind: "erinnerung" | "termin";
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM; bei Erinnerungen immer gesetzt
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  remindBefore: RemindBefore;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "date", "time", "endTime", "allDay", "location", "remindBefore"],
  properties: {
    kind: { type: "string", enum: ["erinnerung", "termin"] },
    title: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD" },
    time: { type: ["string", "null"], description: "HH:MM (24 h) oder null" },
    endTime: { type: ["string", "null"], description: "HH:MM (24 h) oder null" },
    allDay: { type: "boolean" },
    location: { type: ["string", "null"] },
    remindBefore: { type: "integer", enum: [...REMIND_BEFORE] },
  },
};

function instructions(now: Date, tz: string): string {
  const { day, hhmm } = localClock(now, tz);
  return `Du wandelst eine kurze deutsche Notiz in eine Erinnerung oder einen Kalendertermin um.
Jetzt ist ${formatDayLong(day)}, ${day}, ${hhmm} Uhr (Zeitzone ${tz}).
- kind: "erinnerung", wenn Luis an etwas erinnert werden will („erinnere mich“, „nicht vergessen“, eine Aufgabe zu einer Uhrzeit).
  "termin" bei Verabredungen, Arztbesuchen, Veranstaltungen, Fahrstunden, Training, Zeiträumen („von … bis“) oder einem Ort.
- title: kurz und ohne Datum/Uhrzeit, erster Buchstabe groß (z. B. „Mathe lernen“, „Zahnarzt“).
- date: relative Angaben auflösen („morgen“, „übermorgen“, „Freitag“ = der nächste Freitag, „in 2 Stunden“). Ohne Datum: heute,
  oder morgen, falls die Uhrzeit heute schon vorbei ist.
- time: „17 Uhr“ → 17:00, „halb 8“ → 07:30 (abends 19:30, wenn es sonst schon vorbei oder unplausibel ist). Erinnerung ohne Uhrzeit → 09:00.
- endTime nur bei Terminen mit Ende („bis 9“), sonst null. allDay nur bei Terminen ohne Uhrzeit.
- location nur, wenn ein Ort genannt ist. remindBefore: Minuten vorher („30 Minuten vorher erinnern“ → 30), sonst 0.`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** KI-Antwort prüfen und in ein gültiges Formular verwandeln. */
export function normalizeQuickEntry(raw: QuickEntry, now: Date, tz: string): QuickEntry {
  const { day, hhmm } = localClock(now, tz);
  const kind = raw.kind === "termin" ? "termin" : "erinnerung";
  let date = DATE.test(raw.date) && !Number.isNaN(Date.parse(raw.date)) ? raw.date : day;
  let time = raw.time && TIME.test(raw.time) ? raw.time : null;
  if (kind === "erinnerung" && !time) time = "09:00";
  // Vergangenes Datum → heute; eine Erinnerung, deren Uhrzeit heute schon vorbei ist → morgen
  if (date < day) date = day;
  if (kind === "erinnerung" && date === day && time && time <= hhmm) date = addDays(day, 1);
  const allDay = kind === "termin" && !time;
  const endTime = kind === "termin" && time && raw.endTime && TIME.test(raw.endTime) && raw.endTime !== time ? raw.endTime : null;
  const remindBefore = (REMIND_BEFORE as readonly number[]).includes(raw.remindBefore) ? raw.remindBefore : 0;
  return {
    kind,
    title: raw.title.trim().slice(0, 120) || "Erinnerung",
    date,
    time: allDay ? null : time,
    endTime,
    allDay,
    location: kind === "termin" ? raw.location?.trim() || null : null,
    remindBefore: kind === "termin" ? (remindBefore as RemindBefore) : 0,
  };
}

export async function parseQuickEntry(db: DB, text: string, now: Date, tz: string): Promise<QuickEntry> {
  const raw = await structuredCompletion<QuickEntry>(db, {
    purpose: "schnelleingabe",
    instructions: instructions(now, tz),
    input: text.slice(0, 300),
    schemaName: "quick_entry",
    schema: SCHEMA,
  });
  return normalizeQuickEntry(raw, now, tz);
}
