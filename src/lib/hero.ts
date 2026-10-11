import type { Exam } from "@/integrations/exams";
import { daysUntil } from "@/integrations/exams";
import type { SchoolLesson, SchoolWeek } from "@/integrations/untis";
import type { Weather } from "@/integrations/weather";
import { parseCourse } from "./courses";
import { addDays, weekdayShort } from "./time";
import { describeWeather } from "./weather-codes";

/** Kurztexte für den Heute-Bereich – reine Funktionen, damit sie ohne Server testbar sind. */

export type Tone = "normal" | "warning" | "critical";
export type ChipText = { value: string; tone: Tone };

const courseName = (l: SchoolLesson) => parseCourse(l.subject).title;

export function nextLessonText(week: SchoolWeek, day: string, nowTime: string): ChipText {
  const lesson = week.days
    .flatMap((d) => d.lessons)
    .find((l) => l.status !== "cancelled" && (l.day > day || (l.day === day && l.end > nowTime)));
  if (!lesson) return { value: "Diese Woche frei 🎉", tone: "normal" };
  const running = lesson.day === day && lesson.start <= nowTime;
  const when = lesson.day === day ? (running ? `bis ${lesson.end}` : lesson.start) : `${lesson.day === addDays(day, 1) ? "morgen" : weekdayShort(lesson.day)}\u00a0${lesson.start}`;
  const room = lesson.rooms.length ? ` · R\u00a0${lesson.rooms[0]}` : "";
  return { value: `${running ? "Jetzt: " : ""}${courseName(lesson)} · ${when}${room}`, tone: lesson.status === "irregular" ? "warning" : "normal" };
}

export function changesText(week: SchoolWeek, day: string): ChipText {
  const relevant = week.changes.filter((l) => l.day === day || l.day === addDays(day, 1));
  if (!relevant.length) return { value: "Keine heute & morgen", tone: "normal" };
  const first = relevant[0];
  const what = first.status === "cancelled" ? "entfällt" : "geändert";
  const when = first.day === day ? "Heute" : "Morgen";
  const more = relevant.length > 1 ? ` (+${relevant.length - 1})` : "";
  return { value: `${when}: ${courseName(first)} ${what}${more}`, tone: "warning" };
}

export function nextExamText(list: Exam[], day: string): ChipText {
  const next = list.find((x) => x.day >= day);
  if (!next) return { value: "Keine geplant", tone: "normal" };
  const days = daysUntil(next.day, day);
  const when = days <= 0 ? "heute" : days === 1 ? "morgen" : `in\u00a0${days}\u00a0Tagen`;
  return { value: `${next.label}${next.course ? ` ${next.course}` : ""} · ${when}`, tone: days <= 2 ? "critical" : days <= 7 ? "warning" : "normal" };
}

export function weatherText(w: Weather): ChipText {
  const today = w.daily[0];
  const d = describeWeather(w.current.code, w.current.isDay);
  const range = today ? ` · ${Math.round(today.min)}–${Math.round(today.max)}°` : "";
  const rain = today && today.precipProb >= 50 ? " · ☂︎" : "";
  return { value: `${Math.round(w.current.temp)}° ${d.label}${range}${rain}`, tone: "normal" };
}
