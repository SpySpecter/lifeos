import { describe, expect, it } from "vitest";
import {
  abiNote,
  addGrade,
  addGradeCourse,
  deleteGradeCourse,
  gradesBetween,
  importGradeCourses,
  listGradeCourses,
  matchCourse,
  neededInNextKlausur,
  projection,
  semesterPoints,
  setOverride,
  updateGradeCourse,
  type GradeCourse,
} from "@/lib/grades";
import { memoryDb } from "./support/db";

const g = (kind: "klausur" | "muendlich" | "sonstig", points: number, semester: "Q1" | "Q2" | "Q3" | "Q4" = "Q1", weight = 1) => ({
  id: 0,
  courseId: 1,
  semester,
  kind,
  points,
  weight,
  label: null,
  day: "2026-10-01",
});

const course = (over: Partial<GradeCourse> = {}): GradeCourse => ({
  id: 1,
  subject: "Mathematik",
  kind: "LK",
  klausurWeight: 0.5,
  target: 12,
  examSlot: null,
  examExpected: null,
  grades: [],
  overrides: {},
  ...over,
});

describe("Halbjahresnote", () => {
  it("Klausur und Sonstiges nach Anteil, kaufmännisch gerundet", () => {
    expect(semesterPoints(course({ grades: [g("klausur", 10), g("muendlich", 13)] }), "Q1")).toEqual({ points: 12, exact: 11.5, official: false });
    expect(semesterPoints(course({ klausurWeight: 1 / 3, grades: [g("klausur", 9), g("muendlich", 12), g("sonstig", 12)] }), "Q1")?.points).toBe(11);
    expect(semesterPoints(course({ grades: [g("muendlich", 7)] }), "Q1")?.points).toBe(7);
    expect(semesterPoints(course(), "Q2")).toBeNull();
    expect(semesterPoints(course({ grades: [g("klausur", 3)], overrides: { Q1: 9 } }), "Q1")).toEqual({ points: 9, exact: 9, official: true });
  });

  it("was brauche ich in der nächsten Klausur?", () => {
    // Schnitt sonst 12, eine Klausur mit 10: braucht noch (10 + x)/2 · 0,5 + 6 ≥ 11,5 → x ≥ 12
    expect(neededInNextKlausur(course({ grades: [g("klausur", 10), g("muendlich", 12)] }), "Q1", 12)).toEqual({ status: "braucht", points: 12 });
    expect(neededInNextKlausur(course({ grades: [g("muendlich", 15)] }), "Q1", 8)).toEqual({ status: "sicher" });
    expect(neededInNextKlausur(course({ grades: [g("klausur", 2), g("muendlich", 5)] }), "Q1", 12)).toEqual({ status: "unerreichbar", best: 7 });
    expect(neededInNextKlausur(course(), "Q1", 12)).toEqual({ status: "braucht", points: 12 });
  });
});

describe("Gesamtqualifikation", () => {
  it("Abi-Tabelle", () => {
    expect(abiNote(900)).toBe(1);
    expect(abiNote(823)).toBe(1);
    expect(abiNote(822)).toBe(1.1);
    expect(abiNote(600)).toBe(2.3);
    expect(abiNote(300)).toBe(4);
    expect(abiNote(299)).toBeNull();
  });

  it("LK zählt doppelt, Fehlendes wird geschätzt", () => {
    const lk = course({ id: 1, overrides: { Q1: 12, Q2: 12, Q3: 12, Q4: 12 }, examSlot: 1, examExpected: 12 });
    const gk = course({ id: 2, subject: "Deutsch", kind: "GK", overrides: { Q1: 9 } });
    const p = projection([lk, gk]);
    // P = 4·12·2 + 4·9 = 132, S = 12 → 11 Punkte Schnitt → E_I = 440
    expect(p.blockI).toBe(440);
    expect(p.average).toBe(11);
    // Prüfung 1: 12; Prüfungen 2–5 geschätzt mit 11
    expect(p.blockII).toBe(12 * 4 + 4 * 11 * 4);
    expect(p.total).toBe(440 + 224);
    expect(p.note).toBe(abiNote(664));
    expect(p.estimated).toBe(true);
    expect(projection([]).note).toBeNull();
  });

  it("ordnet Klausuren aus dem Kalender Kursen zu", () => {
    const list = [course({ subject: "Mathematik", kind: "LK" }), course({ id: 2, subject: "Deutsch", kind: "GK" })];
    expect(matchCourse(list, { label: "Mathe", course: "LK" })?.subject).toBe("Mathematik");
    expect(matchCourse(list, { label: "Mathematik", course: "GK" })).toBeUndefined();
    expect(matchCourse(list, { label: "Deutsch", course: null })?.kind).toBe("GK");
  });
});

describe("Noten in der Datenbank", () => {
  it("Kurse, Noten, offizielle Halbjahresnote, Prüfungsplatz eindeutig", () => {
    const db = memoryDb();
    const ma = addGradeCourse(db, { subject: "Mathematik", kind: "LK" });
    expect(importGradeCourses(db, [{ subject: "Mathematik", kind: "LK" }, { subject: "Informatik", kind: "LK" }, { subject: "Informatik", kind: "LK" }])).toBe(1);
    const inf = listGradeCourses(db).find((c) => c.subject === "Informatik")!.id;
    addGrade(db, { courseId: ma, semester: "Q1", kind: "klausur", points: 11, day: "2026-10-05", label: "1. Klausur" });
    setOverride(db, ma, "Q2", 13);
    updateGradeCourse(db, ma, { subject: "Mathematik", kind: "LK", klausurWeight: 0.5, target: 12, examSlot: 1, examExpected: 12 });
    updateGradeCourse(db, inf, { subject: "Informatik", kind: "LK", klausurWeight: 0.5, target: null, examSlot: 1, examExpected: null });
    const [a, b] = listGradeCourses(db);
    expect(a).toMatchObject({ subject: "Mathematik", examSlot: null, target: 12, overrides: { Q2: 13 } });
    expect(a.grades).toHaveLength(1);
    expect(b).toMatchObject({ subject: "Informatik", examSlot: 1 });
    expect(gradesBetween(db, "2026-10-01", "2026-10-07")).toMatchObject([{ subject: "Mathematik", points: 11, label: "1. Klausur" }]);
    deleteGradeCourse(db, ma);
    expect(db.prepare("SELECT COUNT(*) AS n FROM grades").get()).toEqual({ n: 0 });
  });
});
