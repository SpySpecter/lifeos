import type { Exam } from "@/integrations/exams";
import { daysUntil } from "@/integrations/exams";
import type { SchoolLesson, SchoolWeek } from "@/integrations/untis";
import type { Weather } from "@/integrations/weather";
import { parseCourse } from "./courses";
import { addDays, formatDayLong } from "./time";
import { describeWeather } from "./weather-codes";

/**
 * Die „Tage-Kacheln“ oben auf der Heute-Seite: eine große Zahl oder Uhrzeit, darüber worum es geht,
 * darunter der Zusammenhang. Reine Funktionen, damit sie ohne Server testbar sind.
 */

export type Tone = "normal" | "warning" | "critical";
export type HeroTile = {
  label: string;
  value: string;
  /** kleine Einheit hinter dem Wert, z. B. „Tage“ */
  unit?: string;
  caption: string;
  tone: Tone;
};

/** Wie im Schul-Widget: Kurscodes („LK Ma 1“) übersetzen, sonst den Langnamen aus Untis nehmen. */
export const courseName = (l: SchoolLesson) => {
  const c = parseCourse(l.subject);
  return c.kind || !l.subjectLong ? c.title : l.subjectLong;
};
const room = (l: SchoolLesson) => (l.rooms.length ? ` · R ${l.rooms[0]}` : "");

export function lessonTile(week: SchoolWeek, day: string, nowTime: string): HeroTile {
  const lesson = week.days
    .flatMap((d) => d.lessons)
    .find((l) => l.status !== "cancelled" && (l.day > day || (l.day === day && l.end > nowTime)));
  if (!lesson) return { label: "Nächste Stunde", value: "Frei", caption: "Diese Woche kein Unterricht mehr 🎉", tone: "normal" };
  const tone: Tone = lesson.status === "irregular" ? "warning" : "normal";
  const changed = lesson.status === "irregular" ? " · geändert" : "";
  if (lesson.day === day && lesson.start <= nowTime) {
    return { label: "Jetzt · bis", value: lesson.end, caption: `${courseName(lesson)}${room(lesson)}${changed}`, tone };
  }
  const label = lesson.day === day ? "Nächste Stunde" : lesson.day === addDays(day, 1) ? "Morgen" : formatDayLong(lesson.day).split(",")[0];
  return { label, value: lesson.start, caption: `${courseName(lesson)}${room(lesson)}${changed}`, tone };
}

export function changesTile(week: SchoolWeek, day: string): HeroTile {
  const relevant = week.changes.filter((l) => l.day === day || l.day === addDays(day, 1));
  if (!relevant.length) return { label: "Ausfälle", value: "0", caption: "Heute und morgen alles normal", tone: "normal" };
  const first = relevant[0];
  const what = first.status === "cancelled" ? "entfällt" : "geändert";
  const when = first.day === day ? "heute" : "morgen";
  const more = relevant.length > 1 ? ` · +${relevant.length - 1}` : "";
  return { label: "Ausfälle", value: String(relevant.length), caption: `${courseName(first)} ${what} ${when}${more}`, tone: "warning" };
}

export function examTile(list: Exam[], day: string): HeroTile {
  const next = list.find((x) => x.day >= day);
  if (!next) return { label: "Nächste Klausur", value: "–", caption: "Keine geplant", tone: "normal" };
  const days = daysUntil(next.day, day);
  const tone: Tone = days <= 2 ? "critical" : days <= 7 ? "warning" : "normal";
  const name = `${next.label}${next.course ? ` ${next.course}` : ""}`;
  if (days <= 0) return { label: "Klausur", value: "Heute", caption: name, tone };
  return { label: "Nächste Klausur", value: String(days), unit: days === 1 ? "Tag" : "Tage", caption: name, tone };
}

export function weatherTile(w: Weather): HeroTile {
  const today = w.daily[0];
  const d = describeWeather(w.current.code, w.current.isDay);
  const range = today ? ` · ${Math.round(today.min)}–${Math.round(today.max)}°` : "";
  const rain = today && today.precipProb >= 50 ? ` · ☂︎ ${today.precipProb} %` : "";
  return { label: w.place ?? "Wetter", value: `${Math.round(w.current.temp)}°`, caption: `${d.label}${range}${rain}`, tone: "normal" };
}

/** Kleines Emoji je Tageszeit – passt zur Begrüßung statt immer zu winken. */
export function greetingEmoji(greeting: string): string {
  if (greeting.startsWith("Guten Morgen")) return "☀️";
  if (greeting.startsWith("Guten Abend")) return "🌆";
  if (greeting.startsWith("Gute Nacht")) return "🌙";
  return "👋";
}
