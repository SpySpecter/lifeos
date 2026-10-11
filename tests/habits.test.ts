import { describe, expect, it } from "vitest";
import {
  addHabit,
  archiveHabit,
  deleteHabit,
  habitHeatmap,
  listArchivedHabits,
  listHabits,
  restoreHabit,
  streak,
  toggleHabit,
} from "@/lib/habits";
import { memoryDb } from "./support/db";

describe("streak", () => {
  const days = (...d: string[]) => new Set(d);
  it("zählt aufeinanderfolgende Tage bis heute", () => {
    expect(streak(days("2026-10-09", "2026-10-10", "2026-10-11"), "2026-10-11")).toBe(3);
  });
  it("bricht nicht ab, wenn heute noch offen ist", () => {
    expect(streak(days("2026-10-09", "2026-10-10"), "2026-10-11")).toBe(2);
  });
  it("ist 0 nach einer Lücke", () => {
    expect(streak(days("2026-10-08"), "2026-10-11")).toBe(0);
  });
  it("funktioniert über Monatsgrenzen", () => {
    expect(streak(days("2026-09-30", "2026-10-01"), "2026-10-01")).toBe(2);
  });
});

describe("Habits in der Datenbank", () => {
  it("anlegen, abhaken, rückgängig, archivieren", () => {
    const db = memoryDb();
    const id = addHabit(db, "Lesen", "📚");
    expect(toggleHabit(db, id, "2026-10-11")).toBe(true);
    let [h] = listHabits(db, "2026-10-11");
    expect(h).toMatchObject({ name: "Lesen", doneToday: true, streak: 1 });
    expect(h.history.at(-1)).toEqual({ day: "2026-10-11", done: true });

    expect(toggleHabit(db, id, "2026-10-11")).toBe(false);
    [h] = listHabits(db, "2026-10-11");
    expect(h.doneToday).toBe(false);

    archiveHabit(db, id);
    expect(listHabits(db, "2026-10-11")).toEqual([]);
  });

  it("Heatmap zählt nur aktive Habits", () => {
    const db = memoryDb();
    const a = addHabit(db, "A", "✅");
    const b = addHabit(db, "B", "✅");
    toggleHabit(db, a, "2026-10-11");
    toggleHabit(db, b, "2026-10-11");
    archiveHabit(db, b);
    const heat = habitHeatmap(db, "2026-10-11", 7);
    expect(heat).toHaveLength(7);
    expect(heat.at(-1)).toEqual({ day: "2026-10-11", count: 1, total: 1 });
  });
});

describe("Habits löschen und wiederherstellen", () => {
  it("archiviert → wiederhergestellt erscheint wieder", () => {
    const db = memoryDb();
    const id = addHabit(db, "Sport", "🏃");
    toggleHabit(db, id, "2026-10-10");
    archiveHabit(db, id);
    expect(listHabits(db, "2026-10-11")).toHaveLength(0);
    expect(listArchivedHabits(db)).toEqual([{ id, name: "Sport", emoji: "🏃", checks: 1 }]);
    restoreHabit(db, id);
    expect(listHabits(db, "2026-10-11").map((h) => h.name)).toEqual(["Sport"]);
    expect(listArchivedHabits(db)).toEqual([]);
  });

  it("löschen entfernt Habit und alle Häkchen", () => {
    const db = memoryDb();
    const keep = addHabit(db, "Lesen", "📚");
    const gone = addHabit(db, "Zocken", "🎮");
    toggleHabit(db, gone, "2026-10-10");
    toggleHabit(db, gone, "2026-10-11");
    toggleHabit(db, keep, "2026-10-11");
    deleteHabit(db, gone);
    expect(listHabits(db, "2026-10-11").map((h) => h.id)).toEqual([keep]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM habit_checks WHERE habit_id = ?").get(gone)).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM habit_checks").get()).toMatchObject({ n: 1 });
  });
});
