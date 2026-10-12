import { describe, expect, it } from "vitest";
import {
  addHabit,
  archiveHabit,
  coveredDays,
  deleteHabit,
  habitHeatmap,
  listArchivedHabits,
  listHabits,
  habitStatus,
  period,
  reorderHabits,
  restoreHabit,
  rhythmLabel,
  streak,
  toggleHabit,
  updateHabit,
  weekStart,
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
    expect(h).toMatchObject({ name: "Lesen", done: true, streak: 1 });
    expect(h.history.at(-1)).toEqual({ day: "2026-10-11", done: true });

    expect(toggleHabit(db, id, "2026-10-11")).toBe(false);
    [h] = listHabits(db, "2026-10-11");
    expect(h.done).toBe(false);

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

describe("Habits umsortieren", () => {
  const names = (db: ReturnType<typeof memoryDb>) => listHabits(db, "2026-10-11").map((h) => h.name);

  it("übernimmt die neue Reihenfolge", () => {
    const db = memoryDb();
    const a = addHabit(db, "A", "✅");
    const b = addHabit(db, "B", "✅");
    const c = addHabit(db, "C", "✅");
    reorderHabits(db, [c, a, b]);
    expect(names(db)).toEqual(["C", "A", "B"]);
  });

  it("fehlende Habits rutschen ans Ende, fremde und archivierte IDs zählen nicht", () => {
    const db = memoryDb();
    addHabit(db, "A", "✅");
    addHabit(db, "B", "✅");
    const c = addHabit(db, "C", "✅");
    const d = addHabit(db, "D", "✅");
    archiveHabit(db, d);
    reorderHabits(db, [999, d, c, c]);
    expect(names(db)).toEqual(["C", "A", "B"]);
    // neue Habits landen weiterhin hinten
    addHabit(db, "E", "✅");
    expect(names(db)).toEqual(["C", "A", "B", "E"]);
  });
});

describe("Takt: wöchentlich, monatlich, alle N Tage", () => {
  // 2026-10-12 ist ein Montag
  it("Wochen laufen Mo–So, Monate nach Kalender", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(period("weekly", "2026-10-14")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(period("monthly", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(period("monthly", "2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });

  it("wöchentlich: erledigt für die ganze Woche, Serie in Wochen", () => {
    const weekly = { cadence: "weekly" as const, intervalDays: null };
    expect(habitStatus(weekly, ["2026-10-05", "2026-10-13"], "2026-10-16")).toEqual({ done: true, status: "diese Woche erledigt", streak: 2 });
    // diese Woche noch offen: Serie zählt bis letzte Woche
    expect(habitStatus(weekly, ["2026-09-29", "2026-10-06"], "2026-10-16")).toEqual({ done: false, status: "diese Woche · noch 3 Tage", streak: 2 });
    expect(habitStatus(weekly, ["2026-09-29"], "2026-10-18").status).toBe("diese Woche · nur noch heute");
    expect(habitStatus(weekly, ["2026-09-29"], "2026-10-18").streak).toBe(0);
  });

  it("monatlich", () => {
    const monthly = { cadence: "monthly" as const, intervalDays: null };
    expect(habitStatus(monthly, ["2026-08-31", "2026-09-01"], "2026-10-12")).toEqual({ done: false, status: "diesen Monat · noch 20 Tage", streak: 2 });
    expect(habitStatus(monthly, ["2026-09-01", "2026-10-02"], "2026-10-12")).toMatchObject({ done: true, streak: 2 });
  });

  it("alle N Tage: fällig ab N Tagen nach dem letzten Häkchen", () => {
    const every3 = { cadence: "interval" as const, intervalDays: 3 };
    expect(habitStatus(every3, [], "2026-10-12")).toEqual({ done: false, status: "fällig", streak: 0 });
    expect(habitStatus(every3, ["2026-10-12"], "2026-10-12")).toEqual({ done: true, status: "wieder in 3 Tagen", streak: 1 });
    expect(habitStatus(every3, ["2026-10-12"], "2026-10-14").status).toBe("morgen wieder fällig");
    expect(habitStatus(every3, ["2026-10-06", "2026-10-09", "2026-10-12"], "2026-10-15")).toEqual({ done: false, status: "heute fällig", streak: 3 });
    expect(habitStatus(every3, ["2026-10-06", "2026-10-09"], "2026-10-14")).toEqual({ done: false, status: "seit 2 Tagen fällig", streak: 0 });
    // zu spät abgehakt: Serie beginnt neu
    expect(habitStatus(every3, ["2026-10-01", "2026-10-09"], "2026-10-10").streak).toBe(1);
  });

  it("abgedeckte Tage für Verlauf und Heatmap", () => {
    const days = ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];
    expect([...coveredDays({ cadence: "weekly", intervalDays: null }, ["2026-10-13"], days)]).toEqual(["2026-10-12", "2026-10-13"]);
    expect([...coveredDays({ cadence: "interval", intervalDays: 2 }, ["2026-10-10"], days)]).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("in der Datenbank: zweiter Tipp im Zeitraum nimmt das Häkchen zurück", () => {
    const db = memoryDb();
    const id = addHabit(db, "Zimmer aufräumen", "🧹", null, { cadence: "weekly", intervalDays: null });
    expect(toggleHabit(db, id, "2026-10-12")).toBe(true);
    let [h] = listHabits(db, "2026-10-14");
    expect(h).toMatchObject({ cadence: "weekly", done: true, checkedToday: false, streak: 1, streakUnit: "Wochen", status: "diese Woche erledigt" });
    expect(h.history.slice(-3).map((d) => d.done)).toEqual([true, true, true]);
    expect(toggleHabit(db, id, "2026-10-14")).toBe(false);
    [h] = listHabits(db, "2026-10-14");
    expect(h.done).toBe(false);
    expect(habitHeatmap(db, "2026-10-14", 1)).toEqual([{ day: "2026-10-14", count: 0, total: 1 }]);

    updateHabit(db, id, { name: "Gießen", emoji: "🪴", remindAt: null, cadence: "interval", intervalDays: 4 });
    toggleHabit(db, id, "2026-10-14");
    [h] = listHabits(db, "2026-10-16");
    expect(h).toMatchObject({ name: "Gießen", cadence: "interval", intervalDays: 4, done: true, status: "wieder in 2 Tagen" });
    expect(rhythmLabel(h)).toBe("alle 4 Tage");
  });
});
