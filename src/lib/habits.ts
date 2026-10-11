import type { DB } from "./db";
import { addDays, lastDays } from "./time";

export type Habit = {
  id: number;
  name: string;
  emoji: string;
  doneToday: boolean;
  streak: number;
  /** Erledigt-Status der letzten `historyDays` Tage, älteste zuerst. */
  history: { day: string; done: boolean }[];
};

export function listHabits(db: DB, day: string, historyDays = 7): Habit[] {
  const habits = db
    .prepare("SELECT id, name, emoji FROM habits WHERE archived = 0 ORDER BY position, id")
    .all() as { id: number; name: string; emoji: string }[];
  if (!habits.length) return [];

  const from = addDays(day, -370);
  const checks = db.prepare("SELECT habit_id, day FROM habit_checks WHERE day >= ? AND day <= ?").all(from, day) as {
    habit_id: number;
    day: string;
  }[];
  const byHabit = new Map<number, Set<string>>();
  for (const c of checks) {
    if (!byHabit.has(c.habit_id)) byHabit.set(c.habit_id, new Set());
    byHabit.get(c.habit_id)!.add(c.day);
  }

  const window = lastDays(day, historyDays);
  return habits.map((h) => {
    const done = byHabit.get(h.id) ?? new Set<string>();
    return {
      ...h,
      doneToday: done.has(day),
      streak: streak(done, day),
      history: window.map((d) => ({ day: d, done: done.has(d) })),
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

export function toggleHabit(db: DB, habitId: number, day: string): boolean {
  const exists = db.prepare("SELECT 1 FROM habit_checks WHERE habit_id = ? AND day = ?").get(habitId, day);
  if (exists) {
    db.prepare("DELETE FROM habit_checks WHERE habit_id = ? AND day = ?").run(habitId, day);
    return false;
  }
  db.prepare("INSERT INTO habit_checks (habit_id, day) VALUES (?, ?)").run(habitId, day);
  return true;
}

export function addHabit(db: DB, name: string, emoji: string): number {
  const { pos } = db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM habits").get() as { pos: number };
  const res = db
    .prepare("INSERT INTO habits (name, emoji, position, created_at) VALUES (?, ?, ?, ?)")
    .run(name, emoji, pos, Date.now());
  return Number(res.lastInsertRowid);
}

export function archiveHabit(db: DB, habitId: number): void {
  db.prepare("UPDATE habits SET archived = 1 WHERE id = ?").run(habitId);
}

/** Erledigte Tage je Habit für eine Heatmap (z. B. 12 Wochen). */
export function habitHeatmap(db: DB, day: string, days: number): { day: string; count: number; total: number }[] {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM habits WHERE archived = 0").get() as { total: number };
  const range = lastDays(day, days);
  const rows = db
    .prepare(
      "SELECT c.day, COUNT(*) AS n FROM habit_checks c JOIN habits h ON h.id = c.habit_id " +
        "WHERE h.archived = 0 AND c.day >= ? AND c.day <= ? GROUP BY c.day",
    )
    .all(range[0], day) as { day: string; n: number }[];
  const counts = new Map(rows.map((r) => [r.day, r.n]));
  return range.map((d) => ({ day: d, count: counts.get(d) ?? 0, total }));
}
