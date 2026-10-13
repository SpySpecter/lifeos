import type { DB } from "./db";
import { addDays, lastDays } from "./time";

/**
 * Gewohnheiten mit Takt: täglich, wöchentlich (Mo–So), monatlich (Kalendermonat) oder alle N Tage
 * (rollierend ab dem letzten Häkchen). „Erledigt“ heißt: im aktuellen Zeitraum abgehakt.
 */

export const CADENCES = ["daily", "weekly", "monthly", "interval"] as const;
export type Cadence = (typeof CADENCES)[number];
export type Rhythm = { cadence: Cadence; intervalDays: number | null };

export type Habit = Rhythm & {
  id: number;
  name: string;
  emoji: string;
  /** Erinnerungszeit 'HH:MM' (APP_TZ) oder null */
  remindAt: string | null;
  /** im aktuellen Zeitraum erledigt */
  done: boolean;
  /** heute abgehakt (nicht nur früher im Zeitraum) */
  checkedToday: boolean;
  /** kurzer Stand für nicht-tägliche, z. B. „noch 3 Tage“ oder „wieder in 2 Tagen“ */
  status: string | null;
  streak: number;
  /** Einheit der Serie: Tage, Wochen, Monate oder „×“ pünktlich */
  streakUnit: string;
  /** Erledigt-Stand (Zeitraum abgedeckt) der letzten `historyDays` Tage, älteste zuerst. */
  history: { day: string; done: boolean }[];
};

const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

/** Montag der Woche. */
export function weekStart(day: string): string {
  return addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const monthEnd = (day: string) => addDays(monthStart(addDays(monthStart(day), 32)), -1);

/** Kalender-Zeitraum, in dem ein Häkchen an `day` zählt (nicht für „alle N Tage“). */
export function period(cadence: Exclude<Cadence, "interval">, day: string): { start: string; end: string } {
  if (cadence === "weekly") {
    const start = weekStart(day);
    return { start, end: addDays(start, 6) };
  }
  if (cadence === "monthly") return { start: monthStart(day), end: monthEnd(day) };
  return { start: day, end: day };
}

const previousPeriod = (cadence: Exclude<Cadence, "interval">, start: string) => period(cadence, addDays(start, -1));
const intervalOf = (r: Rhythm) => Math.max(1, r.intervalDays ?? 1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const UNITS: Record<Cadence, string> = { daily: "Tage", weekly: "Wochen", monthly: "Monate", interval: "× pünktlich" };

/** Ist `d` durch ein Häkchen abgedeckt (Zeitraum erledigt)? Für Heatmap, Verlauf und Quote. */
export function coveredDays(r: Rhythm, checks: string[], days: string[]): Set<string> {
  const out = new Set<string>();
  if (r.cadence === "interval") {
    const n = intervalOf(r);
    const wanted = new Set(days);
    for (const c of checks) for (let i = 0; i < n; i++) if (wanted.has(addDays(c, i))) out.add(addDays(c, i));
    return out;
  }
  const keys = new Set(checks.map((c) => period(r.cadence as Exclude<Cadence, "interval">, c).start));
  for (const d of days) if (keys.has(period(r.cadence as Exclude<Cadence, "interval">, d).start)) out.add(d);
  return out;
}

/** Stand einer Gewohnheit an `day`. `checks` aufsteigend sortiert, nur Tage bis einschließlich `day`. */
export function habitStatus(r: Rhythm, checks: string[], day: string): { done: boolean; status: string | null; streak: number } {
  const set = new Set(checks);
  if (r.cadence === "daily") return { done: set.has(day), status: null, streak: streak(set, day) };

  if (r.cadence === "interval") {
    const n = intervalOf(r);
    const last = checks.at(-1);
    if (!last) return { done: false, status: "fällig", streak: 0 };
    const nextDue = addDays(last, n);
    const left = daysBetween(day, nextDue);
    let streakN = 0;
    if (left >= 0) {
      // pünktlich = Abstand zum vorigen Häkchen höchstens N Tage
      streakN = 1;
      for (let i = checks.length - 1; i > 0 && daysBetween(checks[i - 1], checks[i]) <= n; i--) streakN++;
    }
    const status =
      left > 0
        ? last === day
          ? `wieder in ${plural(n, "Tag", "Tagen")}`
          : left === 1
            ? "morgen wieder fällig"
            : `wieder in ${left} Tagen`
        : left === 0
          ? "heute fällig"
          : `seit ${plural(-left, "Tag", "Tagen")} fällig`;
    return { done: left > 0, status, streak: streakN };
  }

  const cur = period(r.cadence, day);
  const inPeriod = (p: { start: string; end: string }) => checks.some((c) => c >= p.start && c <= p.end);
  const done = inPeriod(cur);
  let n = 0;
  for (let p = done ? cur : previousPeriod(r.cadence, cur.start); inPeriod(p); p = previousPeriod(r.cadence, p.start)) n++;
  const word = r.cadence === "weekly" ? "diese Woche" : "diesen Monat";
  const left = daysBetween(day, cur.end) + 1;
  return { done, status: done ? `${word} erledigt` : left === 1 ? `${word} · nur noch heute` : `${word} · noch ${left} Tage`, streak: n };
}

type HabitRow = { id: number; name: string; emoji: string; remindAt: string | null; cadence: Cadence; intervalDays: number | null };

const HABIT_SELECT = "SELECT id, name, emoji, remind_at AS remindAt, cadence, interval_days AS intervalDays FROM habits";

function checksByHabit(db: DB, from: string, to: string): Map<number, string[]> {
  const rows = db.prepare("SELECT habit_id, day FROM habit_checks WHERE day >= ? AND day <= ? ORDER BY day").all(from, to) as { habit_id: number; day: string }[];
  const map = new Map<number, string[]>();
  for (const r of rows) {
    if (!map.has(r.habit_id)) map.set(r.habit_id, []);
    map.get(r.habit_id)!.push(r.day);
  }
  return map;
}

export function listHabits(db: DB, day: string, historyDays = 7): Habit[] {
  const habits = db.prepare(`${HABIT_SELECT} WHERE archived = 0 ORDER BY position, id`).all() as HabitRow[];
  if (!habits.length) return [];
  // alle Häkchen bis heute: Serien sollen nicht nach einem Jahr stehen bleiben (eine Zeile pro Häkchen, bleibt klein)
  const byHabit = checksByHabit(db, "0000-01-01", day);
  const window = lastDays(day, historyDays);
  return habits.map((h) => {
    const checks = byHabit.get(h.id) ?? [];
    const rhythm = { cadence: h.cadence, intervalDays: h.intervalDays };
    const s = habitStatus(rhythm, checks, day);
    const covered = coveredDays(rhythm, checks, window);
    return {
      ...h,
      ...s,
      checkedToday: checks.at(-1) === day,
      streakUnit: UNITS[h.cadence],
      history: window.map((d) => ({ day: d, done: covered.has(d) })),
    };
  });
}

/** Für Rückblicke: an wie vielen der `days` war der Zeitraum jeder aktiven Gewohnheit erledigt, plus Serie am letzten Tag. */
export function habitCoverage(db: DB, days: string[]): (Rhythm & { id: number; name: string; emoji: string; covered: number; streak: number; streakUnit: string })[] {
  const last = days[days.length - 1];
  const habits = db.prepare(`${HABIT_SELECT} WHERE archived = 0 ORDER BY position, id`).all() as HabitRow[];
  const byHabit = checksByHabit(db, "0000-01-01", last);
  return habits.map((h) => {
    const checks = byHabit.get(h.id) ?? [];
    const rhythm = { cadence: h.cadence, intervalDays: h.intervalDays };
    return {
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      ...rhythm,
      covered: coveredDays(rhythm, checks, days).size,
      streak: habitStatus(rhythm, checks, last).streak,
      streakUnit: UNITS[h.cadence],
    };
  });
}

/** Serie aufeinanderfolgender Tage. Ist heute noch offen, zählt die Serie bis gestern (sie ist noch nicht gerissen). */
export function streak(done: Set<string>, day: string): number {
  let cursor = done.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (done.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Kurzbeschreibung des Takts für Formulare und Listen. */
export function rhythmLabel(r: Rhythm): string {
  if (r.cadence === "weekly") return "wöchentlich";
  if (r.cadence === "monthly") return "monatlich";
  if (r.cadence === "interval") return intervalOf(r) === 1 ? "täglich" : `alle ${intervalOf(r)} Tage`;
  return "täglich";
}

/**
 * Abhaken bzw. rückgängig. Ist der Zeitraum schon durch ein früheres Häkchen erledigt (z. B. Montag bei
 * „wöchentlich“), nimmt ein Tipp dieses Häkchen zurück, statt ein zweites zu setzen.
 */
export function toggleHabit(db: DB, habitId: number, day: string): boolean {
  const h = db.prepare("SELECT cadence, interval_days AS intervalDays FROM habits WHERE id = ?").get(habitId) as Rhythm | undefined;
  const rhythm: Rhythm = h ?? { cadence: "daily", intervalDays: null };
  const from =
    rhythm.cadence === "daily" ? day : rhythm.cadence === "interval" ? addDays(day, -(intervalOf(rhythm) - 1)) : period(rhythm.cadence, day).start;
  const last = db
    .prepare("SELECT day FROM habit_checks WHERE habit_id = ? AND day >= ? AND day <= ? ORDER BY day DESC LIMIT 1")
    .get(habitId, from, day) as { day: string } | undefined;
  if (last) {
    db.prepare("DELETE FROM habit_checks WHERE habit_id = ? AND day = ?").run(habitId, last.day);
    return false;
  }
  db.prepare("INSERT INTO habit_checks (habit_id, day) VALUES (?, ?)").run(habitId, day);
  return true;
}

const DAILY: Rhythm = { cadence: "daily", intervalDays: null };
const storedInterval = (r: Rhythm) => (r.cadence === "interval" ? intervalOf(r) : null);

export function addHabit(db: DB, name: string, emoji: string, remindAt: string | null = null, rhythm: Rhythm = DAILY): number {
  const { pos } = db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM habits").get() as { pos: number };
  const res = db
    .prepare("INSERT INTO habits (name, emoji, remind_at, cadence, interval_days, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(name, emoji, remindAt, rhythm.cadence, storedInterval(rhythm), pos, Date.now());
  return Number(res.lastInsertRowid);
}

export function updateHabit(db: DB, habitId: number, h: { name: string; emoji: string; remindAt: string | null } & Partial<Rhythm>): void {
  const before = db.prepare("SELECT remind_at AS remindAt FROM habits WHERE id = ?").get(habitId) as { remindAt: string | null } | undefined;
  db.prepare("UPDATE habits SET name = ?, emoji = ?, remind_at = ? WHERE id = ?").run(h.name, h.emoji, h.remindAt, habitId);
  if (h.cadence) {
    db.prepare("UPDATE habits SET cadence = ?, interval_days = ? WHERE id = ?").run(h.cadence, storedInterval({ cadence: h.cadence, intervalDays: h.intervalDays ?? null }), habitId);
  }
  // Neue Uhrzeit → die Erinnerung darf heute noch einmal kommen
  if (before && before.remindAt !== h.remindAt) db.prepare("DELETE FROM habit_reminders_sent WHERE habit_id = ?").run(habitId);
}

/**
 * Neue Reihenfolge der aktiven Gewohnheiten. Unbekannte oder archivierte IDs werden ignoriert;
 * aktive, die in `ids` fehlen, rutschen in ihrer bisherigen Reihenfolge ans Ende.
 */
export function reorderHabits(db: DB, ids: number[]): void {
  const active = (db.prepare("SELECT id FROM habits WHERE archived = 0 ORDER BY position, id").all() as { id: number }[]).map((r) => r.id);
  const known = new Set(active);
  const ordered = [...new Set(ids.filter((id) => known.has(id)))];
  const rest = active.filter((id) => !ordered.includes(id));
  const set = db.prepare("UPDATE habits SET position = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    [...ordered, ...rest].forEach((id, i) => set.run(i, id));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function archiveHabit(db: DB, habitId: number): void {
  db.prepare("UPDATE habits SET archived = 1 WHERE id = ?").run(habitId);
}

export function restoreHabit(db: DB, habitId: number): void {
  db.prepare("UPDATE habits SET archived = 0 WHERE id = ?").run(habitId);
}

/** Endgültig löschen – die Häkchen verschwinden per ON DELETE CASCADE mit. */
export function deleteHabit(db: DB, habitId: number): void {
  db.prepare("DELETE FROM habits WHERE id = ?").run(habitId);
}

export function listArchivedHabits(db: DB): { id: number; name: string; emoji: string; checks: number }[] {
  return db
    .prepare(
      "SELECT h.id, h.name, h.emoji, COUNT(c.day) AS checks FROM habits h LEFT JOIN habit_checks c ON c.habit_id = h.id " +
        "WHERE h.archived = 1 GROUP BY h.id ORDER BY h.name",
    )
    .all()
    .map((r) => ({ ...(r as { id: number; name: string; emoji: string; checks: number }) }));
}

/** Pro Tag: wie viele aktive Gewohnheiten ihren Zeitraum erfüllt hatten (z. B. 16 Wochen). */
export function habitHeatmap(db: DB, day: string, days: number): { day: string; count: number; total: number }[] {
  const habits = db.prepare(`${HABIT_SELECT} WHERE archived = 0`).all() as HabitRow[];
  const range = lastDays(day, days);
  // so weit zurück, dass auch „alle 365 Tage“ und ein Monat vor dem Fenster mitzählen
  const byHabit = checksByHabit(db, addDays(range[0], -366), day);
  const counts = new Map<string, number>();
  for (const h of habits) {
    for (const d of coveredDays(h, byHabit.get(h.id) ?? [], range)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return range.map((d) => ({ day: d, count: counts.get(d) ?? 0, total: habits.length }));
}
