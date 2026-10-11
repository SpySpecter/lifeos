import { describe, expect, it } from "vitest";
import { daysUntil, examDetail, isExam, parseExamTitle, toExam, upcoming, type Exam } from "@/integrations/exams";
import { changesText, nextExamText, nextLessonText, weatherText } from "@/lib/hero";
import type { SchoolLesson, SchoolWeek } from "@/integrations/untis";

describe("Klausuren erkennen", () => {
  it("erkennt Klausuren, Tests und Prüfungen – aber keine Wörter, die nur so anfangen", () => {
    for (const t of ["📝 Klausur: LK Ma 1", "Geschichtstest: Frühparlamentarismus", "Mathe-Test: Differentialrechnung", "Test: Musik", "Mündliche Prüfung Englisch"]) {
      expect(isExam(t), t).toBe(true);
    }
    for (const t of ["Testament lesen", "Barber", "Musik Projekt", "📚 Schule: LK If 1"]) expect(isExam(t), t).toBe(false);
  });

  it("macht aus Untis-Kursnamen lesbare Fächer", () => {
    expect(parseExamTitle("📝 Klausur: LK Ma 1")).toEqual({ kind: "Klausur", label: "Mathematik", course: "LK", topic: null });
    expect(parseExamTitle("📝 Klausur: GK Pb 2")).toEqual({ kind: "Klausur", label: "Politische Bildung", course: "GK", topic: null });
    expect(parseExamTitle("Geschichtstest: Frühparlamentarismus und Bürgerkrieg")).toEqual({
      kind: "Test",
      label: "Geschichtstest",
      course: null,
      topic: "Frühparlamentarismus und Bürgerkrieg",
    });
    expect(parseExamTitle("Test: Musik")).toEqual({ kind: "Test", label: "Musik", course: null, topic: null });
  });

  it("liest Stunden aus der Beschreibung", () => {
    expect(examDetail("Klausur Mathematik LK (Std 1–3, Band A01 LK). Dauer LK: 135 min.")).toBe("Std 1–3");
    expect(examDetail("Std. 5-6")).toBe("Std. 5–6");
    expect(examDetail(undefined)).toBeNull();
  });

  it("wandelt Kalendertermine in lokale Zeiten um", () => {
    const x = toExam(
      { id: "1", summary: "📝 Klausur: LK If 1", description: "(Std 3–5)", start: { dateTime: "2026-12-01T09:50:00+01:00" }, end: { dateTime: "2026-12-01T12:05:00+01:00" } },
      "Europe/Berlin",
    );
    expect(x).toMatchObject({ day: "2026-12-01", start: "09:50", end: "12:05", label: "Informatik", course: "LK", detail: "Std 3–5" });
    expect(toExam({ id: "2", summary: "Test: Musik", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }, "Europe/Berlin")).toMatchObject({ day: "2026-10-20", start: null });
  });

  it("zeigt nur kommende, sortiert und ohne Doppelte", () => {
    const e = (day: string, label: string): Exam => ({ id: day + label, kind: "Klausur", label, course: null, topic: null, day, start: null, end: null, detail: null, url: null });
    expect(upcoming([e("2026-12-01", "A"), e("2026-10-01", "Alt"), e("2026-11-24", "B"), e("2026-11-24", "B")], "2026-10-11").map((x) => x.label)).toEqual(["B", "A"]);
    expect(daysUntil("2026-11-24", "2026-10-11")).toBe(44);
  });
});

const L = (day: string, start: string, end: string, subject: string, status: SchoolLesson["status"] = "regular", room = "210"): SchoolLesson => ({
  day, start, end, subject, subjectLong: null, teachers: [], rooms: [room], status, note: null,
});
const week = (lessons: SchoolLesson[]): SchoolWeek => ({
  days: [...new Set(lessons.map((l) => l.day))].map((day) => ({ day, lessons: lessons.filter((l) => l.day === day) })),
  changes: lessons.filter((l) => l.status !== "regular"),
});

/** Geschützte Leerzeichen (gegen Umbrüche am Handy) für den Vergleich normalisieren. */
const plain = <T extends { value: string }>(t: T) => ({ ...t, value: t.value.replace(/\u00a0/g, " ") });

describe("Heute-Bereich", () => {
  const w = week([
    L("2026-10-12", "08:00", "09:30", "LK If 1"),
    L("2026-10-12", "09:50", "11:20", "GK Pb 2", "cancelled", "051"),
    L("2026-10-12", "12:20", "13:50", "GK Sp 1", "irregular", "gH1"),
    L("2026-10-13", "08:00", "09:30", "LK Ma 1", "regular", "252"),
  ]);

  it("nächste Stunde: läuft gerade, überspringt Ausfälle, markiert Vertretung", () => {
    expect(plain(nextLessonText(w, "2026-10-12", "07:30"))).toEqual({ value: "Informatik · 08:00 · R 210", tone: "normal" });
    expect(plain(nextLessonText(w, "2026-10-12", "08:30")).value).toBe("Jetzt: Informatik · bis 09:30 · R 210");
    expect(plain(nextLessonText(w, "2026-10-12", "09:40"))).toEqual({ value: "Sport · 12:20 · R gH1", tone: "warning" });
    expect(plain(nextLessonText(w, "2026-10-12", "14:00")).value).toBe("Mathematik · morgen 08:00 · R 252");
    expect(plain(nextLessonText(w, "2026-10-13", "10:00")).value).toBe("Diese Woche frei 🎉");
  });

  it("Ausfälle heute und morgen", () => {
    expect(plain(changesText(w, "2026-10-12"))).toEqual({ value: "Heute: Politische Bildung entfällt (+1)", tone: "warning" });
    expect(plain(changesText(w, "2026-10-11"))).toEqual({ value: "Morgen: Politische Bildung entfällt (+1)", tone: "warning" });
    expect(plain(changesText(w, "2026-10-13")).value).toBe("Keine heute & morgen");
  });

  it("nächste Klausur mit Dringlichkeit", () => {
    const x: Exam = { id: "1", kind: "Klausur", label: "Mathematik", course: "LK", topic: null, day: "2026-11-24", start: "08:00", end: null, detail: null, url: null };
    expect(plain(nextExamText([x], "2026-10-11"))).toEqual({ value: "Mathematik LK · in 44 Tagen", tone: "normal" });
    expect(nextExamText([x], "2026-11-18").tone).toBe("warning");
    expect(plain(nextExamText([x], "2026-11-23"))).toEqual({ value: "Mathematik LK · morgen", tone: "critical" });
    expect(plain(nextExamText([], "2026-10-11")).value).toBe("Keine geplant");
  });

  it("Wetter kompakt", () => {
    const wx = { place: null, current: { temp: 12.6, feelsLike: 11, code: 61, wind: 10, isDay: true }, hourly: [], daily: [{ day: "2026-10-12", code: 61, max: 14.2, min: 7.8, precipProb: 70 }], sunrise: "", sunset: "" };
    expect(plain(weatherText(wx)).value).toBe("13° Regen · 8–14° · ☂︎");
  });
});
