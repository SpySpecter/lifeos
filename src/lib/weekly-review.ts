import "server-only";
import { resolve } from "@/integrations/core";
import { daysUntil, exams, upcoming } from "@/integrations/exams";
import type { DB } from "./db";
import { env, isDemo } from "./env";
import { reviewStats } from "./flashcards";
import { formatNote, gradesBetween, KIND_LABEL, listGradeCourses, projection } from "./grades";
import { habitCoverage } from "./habits";
import { average, healthSeries } from "./health";
import { BudgetExceededError, structuredCompletion } from "./openai";
import { countSubscriptions, sendToAll, type PushMessage, type Sender } from "./push";
import { getSettings } from "./settings";
import { formatMinutes, studyTime, weekRange, type StudyTime } from "./study";
import { addDays, localClock } from "./time";

/**
 * Wochenrückblick: sonntags ein Schnappschuss aus Gewohnheiten, Lernzeit (Plan gegen Ist), Karteikarten,
 * Schlaf und Noten, dazu ein kurzer KI-Kommentar. Gespeichert pro Woche (Schlüssel = Montag), damit die KI
 * höchstens einmal pro Woche läuft; aufgebaut wie das Morgenbriefing.
 */

export type WeeklyReview = {
  /** Montag der Woche */
  week: string;
  /** bis zu diesem Tag gezählt (Sonntag oder heute, falls die Woche noch läuft) */
  until: string;
  createdAt: number;
  habits: { name: string; emoji: string; covered: number; days: number; streak: number; streakUnit: string; daily: boolean }[];
  /** Anteil erfüllter Habit-Tage */
  habitRate: number | null;
  study: StudyTime[];
  studyPlanned: number;
  studyActual: number;
  studyActualPrev: number;
  cards: { reviews: number; known: number; cards: number };
  sleep: { avg: number | null; nights: number; prevAvg: number | null; goal: number };
  steps: number | null;
  grades: { subject: string; kind: string; points: number; label: string | null }[];
  abiNote: number | null;
  exams: { label: string; course: string | null; day: string; inDays: number }[] | null;
  comment: { headline: string; good: string[]; next: string[] } | null;
  /** true = Kommentar von der KI */
  ai: boolean;
};

export const weekStartOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

/** ISO-Kalenderwoche. */
export function isoWeek(monday: string): number {
  // Der Donnerstag der Woche entscheidet das Jahr; KW = wie vielte Woche seit Jahresbeginn er liegt
  const thursday = new Date(`${addDays(weekStartOf(monday), 3)}T12:00:00Z`);
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1, 12)) / 86_400_000);
  return Math.floor(dayOfYear / 7) + 1;
}

export function weekLabel(monday: string): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { ...o, timeZone: "UTC" });
  return `KW ${isoWeek(monday)} · ${fmt(monday, { day: "numeric", month: "short" })} – ${fmt(addDays(monday, 6), { day: "numeric", month: "short" })}`;
}

/** Welche Woche zeigt /rueckblick ohne Parameter? Sonntag die laufende, sonst die letzte vollständige. */
export function defaultWeek(today: string): string {
  const monday = weekStartOf(today);
  return new Date(`${today}T12:00:00Z`).getUTCDay() === 0 ? monday : addDays(monday, -7);
}

const range = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** Zahlen der Woche aus der Datenbank (ohne KI, ohne Netz außer den Klausuren, die übergeben werden). */
export function collectWeek(
  db: DB,
  week: string,
  today: string,
  tz: string,
  upcomingExams: { label: string; course: string | null; day: string }[] | null,
  now = Date.now(),
): WeeklyReview {
  const sunday = addDays(week, 6);
  const until = today < sunday ? today : sunday;
  const days = range(week, until);
  const habits = habitCoverage(db, days).map((h) => ({
    name: h.name,
    emoji: h.emoji,
    covered: h.covered,
    days: days.length,
    streak: h.streak,
    streakUnit: h.streakUnit,
    daily: h.cadence === "daily",
  }));
  const habitDays = habits.reduce((n, h) => n + h.days, 0);

  const r = weekRange(week, tz);
  // laufende Woche: geplant nur bis heute, sonst wirkt Montag wie ein schlechter Start
  const study = studyTime(db, { ...r, to: until });
  const prev = studyTime(db, weekRange(addDays(week, -7), tz));

  const health = healthSeries(db, range(addDays(week, -7), sunday));
  const settings = getSettings(db);
  const sleepNow = health.sleep.slice(7);
  const courses = listGradeCourses(db);

  return {
    week,
    until,
    createdAt: now,
    habits,
    habitRate: habitDays ? habits.reduce((n, h) => n + h.covered, 0) / habitDays : null,
    study,
    studyPlanned: study.reduce((n, s) => n + s.planned, 0),
    studyActual: study.reduce((n, s) => n + s.actual, 0),
    studyActualPrev: prev.reduce((n, s) => n + s.actual, 0),
    cards: reviewStats(db, r.fromMs, r.toMs),
    sleep: { avg: average(sleepNow), nights: sleepNow.filter((v) => v !== null).length, prevAvg: average(health.sleep.slice(0, 7)), goal: settings.goals.sleep },
    steps: average(health.steps.slice(7)),
    grades: gradesBetween(db, week, sunday).map((g) => ({ subject: g.subject, kind: KIND_LABEL[g.kind], points: g.points, label: g.label })),
    abiNote: projection(courses).note,
    exams: upcomingExams
      ? upcomingExams
          .filter((x) => x.day > sunday && x.day <= addDays(sunday, 7))
          .map((x) => ({ label: x.label, course: x.course, day: x.day, inDays: daysUntil(x.day, today) }))
      : null,
    comment: null,
    ai: false,
  };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const num = (x: number, digits = 1) => x.toLocaleString("de-DE", { maximumFractionDigits: digits });

/** Zahlen als kurzer Text für die KI (und für Tests lesbar). */
export function reviewInput(r: WeeklyReview): string {
  const lines = [
    `Woche: ${weekLabel(r.week)}${r.until < addDays(r.week, 6) ? ` (bis ${r.until})` : ""}`,
    `Gewohnheiten: ${r.habitRate === null ? "keine" : pct(r.habitRate)} erfüllt`,
    ...r.habits.map((h) => `- ${h.name}: ${h.covered}/${h.days} Tage${h.streak > 1 ? `, Serie ${h.streak} ${h.streakUnit}` : ""}`),
    `Lernzeit: ${r.studyActual} Min. gemessen von ${r.studyPlanned} Min. geplant (Vorwoche ${r.studyActualPrev} Min.)`,
    ...r.study.map((s) => `- ${s.subject}: ${s.actual}/${s.planned} Min.`),
    `Karteikarten: ${r.cards.reviews} Wiederholungen, ${r.cards.reviews ? pct(r.cards.known / r.cards.reviews) : "–"} gewusst`,
    `Schlaf: ${r.sleep.avg === null ? "keine Daten" : `Ø ${num(r.sleep.avg)} h an ${r.sleep.nights} Nächten (Ziel ${r.sleep.goal} h, Vorwoche ${r.sleep.prevAvg === null ? "–" : `${num(r.sleep.prevAvg)} h`})`}`,
    `Neue Noten: ${r.grades.length ? r.grades.map((g) => `${g.subject} ${g.kind} ${g.points} P.`).join(", ") : "keine"}`,
    `Abi-Hochrechnung: ${r.abiNote === null ? "–" : formatNote(r.abiNote)}`,
    `Klausuren nächste Woche: ${r.exams?.length ? r.exams.map((x) => `${x.label}${x.course ? ` ${x.course}` : ""} (${x.day})`).join(", ") : "keine"}`,
  ];
  return lines.join("\n");
}

/** Ohne KI: ein paar feste Regeln, damit der Rückblick auch im Demo-Modus oder ohne Budget etwas sagt. */
export function ruleComment(r: WeeklyReview): NonNullable<WeeklyReview["comment"]> {
  const good: string[] = [];
  const next: string[] = [];
  const best = [...r.habits].sort((a, b) => b.covered / b.days - a.covered / a.days)[0];
  const worst = [...r.habits].sort((a, b) => a.covered / a.days - b.covered / b.days)[0];
  // erst ab ein paar Tagen aussagekräftig (laufende Woche)
  const enough = (h: { days: number }) => h.days >= 3;
  if (best && enough(best) && best.covered === best.days) good.push(`${best.emoji} ${best.name}: jeden Tag erledigt.`);
  else if (r.habitRate !== null && r.habitRate >= 0.7) good.push(`Gewohnheiten zu ${pct(r.habitRate)} erfüllt.`);
  if (r.studyActual > r.studyActualPrev && r.studyActual > 0) good.push(`${formatMinutes(r.studyActual - r.studyActualPrev)} mehr gelernt als letzte Woche.`);
  if (r.cards.reviews) good.push(`${r.cards.reviews} Karteikarten wiederholt.`);
  if (r.studyPlanned && r.studyActual < r.studyPlanned * 0.6) next.push(`Nur ${pct(r.studyActual / r.studyPlanned)} der geplanten Lernzeit – feste Fokus-Blöcke einplanen.`);
  if (r.sleep.avg !== null && r.sleep.avg < r.sleep.goal - 0.5) next.push(`Im Schnitt ${num(r.sleep.avg)} h Schlaf – früher ins Bett.`);
  if (worst && enough(worst) && worst !== best && worst.covered / worst.days < 0.5) next.push(`${worst.emoji} ${worst.name} kam zu kurz.`);
  if (r.exams?.length) next.push(`Nächste Woche: ${r.exams.map((x) => x.label).join(", ")} – rechtzeitig wiederholen.`);
  return {
    headline: good.length >= next.length ? "Solide Woche 👍" : "Da geht noch was 💪",
    good: good.slice(0, 3),
    next: next.slice(0, 3),
  };
}

const INSTRUCTIONS = `Du schreibst den Wochenrückblick für einen Oberstufenschüler (Brandenburg, Ziel: 12 Punkte im Mathe-LK).
Du bekommst die Zahlen der Woche: Gewohnheiten, Lernzeit (geplant/gemessen), Karteikarten, Schlaf, neue Noten, anstehende Klausuren.
Antworte knapp, ehrlich und motivierend, auf Deutsch, per Du:
- headline: ein kurzer Satz (höchstens 8 Wörter), der die Woche zusammenfasst.
- good: 1–3 Dinge, die gut liefen – konkret mit Zahlen aus den Daten.
- next: 1–3 konkrete Vorsätze für nächste Woche (z. B. Fach, Uhrzeit, Gewohnheit) – mit Blick auf anstehende Klausuren.
Nichts erfinden, was nicht in den Daten steht. Keine Floskeln.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "good", "next"],
  properties: {
    headline: { type: "string" },
    good: { type: "array", items: { type: "string" } },
    next: { type: "array", items: { type: "string" } },
  },
};

async function withComment(db: DB, r: WeeklyReview): Promise<WeeklyReview> {
  if (isDemo() || !env().OPENAI_API_KEY) return { ...r, comment: ruleComment(r), ai: false };
  try {
    const c = await structuredCompletion<NonNullable<WeeklyReview["comment"]>>(db, {
      purpose: "weekly-review",
      instructions: INSTRUCTIONS,
      input: reviewInput(r),
      schemaName: "weekly_review",
      schema: SCHEMA,
    });
    return { ...r, comment: { headline: c.headline.slice(0, 120), good: c.good.slice(0, 3), next: c.next.slice(0, 3) }, ai: true };
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) console.error("[rückblick]", (err as Error).message);
    return { ...r, comment: ruleComment(r), ai: false };
  }
}

export async function buildReview(db: DB, week: string, today: string, tz: string): Promise<WeeklyReview> {
  const ex = await resolve(exams, undefined);
  const list = ex.status === "ok" ? upcoming(ex.data, today).map((x) => ({ label: x.label, course: x.course, day: x.day })) : null;
  return withComment(db, collectWeek(db, week, today, tz, list));
}

export function getReview(db: DB, week: string): WeeklyReview | null {
  const row = db.prepare("SELECT data FROM weekly_reviews WHERE week = ?").get(week) as { data: string | null } | undefined;
  if (!row?.data) return null;
  try {
    return JSON.parse(row.data) as WeeklyReview;
  } catch {
    return null;
  }
}

export function saveReview(db: DB, r: WeeklyReview): void {
  db.prepare(
    "INSERT INTO weekly_reviews (week, created_at, data) VALUES (?, ?, ?) ON CONFLICT(week) DO UPDATE SET created_at = excluded.created_at, data = excluded.data",
  ).run(r.week, r.createdAt, JSON.stringify(r));
}

/** Gespeicherte Wochen (für den Wechsler), neueste zuerst. */
export function listReviewWeeks(db: DB): string[] {
  return (db.prepare("SELECT week FROM weekly_reviews WHERE data IS NOT NULL ORDER BY week DESC LIMIT 52").all() as { week: string }[]).map((r) => r.week);
}

const globalForReview = globalThis as unknown as { lifeosReviewJobs?: Map<string, Promise<WeeklyReview>> };
const jobs = (globalForReview.lifeosReviewJobs ??= new Map());

/**
 * Gespeicherten Rückblick nehmen oder bauen. Eine laufende Woche wird neu gebaut, sobald der gespeicherte
 * Stand von einem früheren Tag ist – sonst bliebe der Rückblick vom Mittwoch bis Sonntag stehen.
 */
export async function getOrCreateReview(db: DB, week: string, today: string, tz: string, opts: { force?: boolean } = {}): Promise<WeeklyReview> {
  if (!opts.force) {
    const saved = getReview(db, week);
    const complete = saved && saved.until >= addDays(week, 6);
    if (saved && (complete || saved.until === today)) return saved;
  }
  const running = jobs.get(week);
  if (running) return running;
  const job = buildReview(db, week, today, tz)
    .then((r) => {
      saveReview(db, r);
      return r;
    })
    .finally(() => jobs.delete(week));
  jobs.set(week, job);
  return job;
}

const CATCH_UP_MINUTES = 180;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function reviewDue(cfg: { enabled: boolean; time: string }, day: string, hhmm: string): boolean {
  if (!cfg.enabled || !/^\d\d:\d\d$/.test(cfg.time)) return false;
  if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) return false;
  const diff = minutes(hhmm) - minutes(cfg.time);
  return diff >= 0 && diff <= CATCH_UP_MINUTES;
}

/** Push für diese Woche vormerken – genau einmal. */
export function claimReviewPush(db: DB, week: string, at: number): boolean {
  const res = db
    .prepare(
      "INSERT INTO weekly_reviews (week, created_at, data, pushed_at) VALUES (?, ?, NULL, ?) " +
        "ON CONFLICT(week) DO UPDATE SET pushed_at = excluded.pushed_at WHERE weekly_reviews.pushed_at IS NULL",
    )
    .run(week, at, at);
  return Number(res.changes) === 1;
}

export function reviewPushMessage(r: WeeklyReview): PushMessage {
  const parts = [
    r.habitRate !== null ? `Habits ${pct(r.habitRate)}` : null,
    r.studyActual ? `${formatMinutes(r.studyActual)} gelernt` : null,
    r.cards.reviews ? `${r.cards.reviews} Karten` : null,
    r.sleep.avg !== null ? `Ø ${num(r.sleep.avg)} h Schlaf` : null,
  ].filter(Boolean);
  return {
    title: `📊 ${r.comment?.headline ?? "Dein Wochenrückblick"}`,
    body: parts.join(" · ") || "Tippen zum Öffnen",
    url: `/rueckblick?woche=${r.week}`,
    tag: "weekly-review",
  };
}

/** Aus der Minuten-Schleife: sonntags zur eingestellten Uhrzeit bauen (frisch) und schicken. */
export async function runWeeklyReview(db: DB, now: Date, tz: string, send?: Sender): Promise<{ sent: number } | null> {
  const { day, hhmm } = localClock(now, tz);
  if (!reviewDue(getSettings(db).weeklyReview, day, hhmm)) return null;
  const week = weekStartOf(day);
  if (!claimReviewPush(db, week, now.getTime())) return null;
  const r = await getOrCreateReview(db, week, day, tz, { force: true });
  if (!countSubscriptions(db)) return { sent: 0 };
  const res = await sendToAll(db, reviewPushMessage(r), send);
  if (res.failed) console.warn(`[rückblick] ${res.failed} fehlgeschlagen (${res.errors.join(", ")})`);
  return { sent: res.sent };
}
