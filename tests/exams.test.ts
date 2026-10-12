import { describe, expect, it } from "vitest";
import { daysUntil, examDetail, isExam, parseExamTitle, toExam, upcoming, type Exam } from "@/integrations/exams";
import { changesTile, examTile, greetingEmoji, lessonTile, weatherTile } from "@/lib/hero";
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
const plain = <T extends { caption: string }>(t: T) => ({ ...t, caption: t.caption.replace(/\u00a0/g, " ") });

describe("Heute-Kacheln", () => {
  const w = week([
    L("2026-10-12", "08:00", "09:30", "LK If 1"),
    L("2026-10-12", "09:50", "11:20", "GK Pb 2", "cancelled", "051"),
    L("2026-10-12", "12:20", "13:50", "GK Sp 1", "irregular", "gH1"),
    L("2026-10-13", "08:00", "09:30", "LK Ma 1", "regular", "252"),
  ]);

  it("nächste Stunde: läuft gerade, überspringt Ausfälle, markiert Vertretung", () => {
    expect(plain(lessonTile(w, "2026-10-12", "07:30"))).toEqual({ label: "Nächste Stunde", value: "08:00", caption: "Informatik · R 210", tone: "normal" });
    expect(plain(lessonTile(w, "2026-10-12", "08:30"))).toMatchObject({ label: "Jetzt · bis", value: "09:30" });
    expect(plain(lessonTile(w, "2026-10-12", "09:40"))).toEqual({ label: "Nächste Stunde", value: "12:20", caption: "Sport · R gH1 · geändert", tone: "warning" });
    expect(plain(lessonTile(w, "2026-10-12", "14:00"))).toMatchObject({ label: "Morgen", value: "08:00", caption: "Mathematik · R 252" });
    expect(lessonTile(w, "2026-10-13", "10:00").value).toBe("Frei");
  });

  it("Ausfälle heute und morgen", () => {
    expect(changesTile(w, "2026-10-12")).toEqual({ label: "Ausfälle", value: "2", caption: "Politische Bildung entfällt heute · +1", tone: "warning" });
    expect(changesTile(w, "2026-10-11").caption).toBe("Politische Bildung entfällt morgen · +1");
    expect(changesTile(w, "2026-10-13")).toMatchObject({ value: "0", tone: "normal" });
  });

  it("nächste Klausur als Countdown mit Dringlichkeit", () => {
    const x = toExam({ id: "1", summary: "📝 Klausur: LK Ma 1", start: { dateTime: "2026-11-24T08:00:00+01:00" }, end: { dateTime: "2026-11-24T10:15:00+01:00" } }, "Europe/Berlin");
    expect(examTile([x], "2026-10-11")).toEqual({ label: "Nächste Klausur", value: "44", unit: "Tage", caption: "Mathematik LK", tone: "normal" });
    expect(examTile([x], "2026-11-18").tone).toBe("warning");
    expect(examTile([x], "2026-11-23")).toMatchObject({ value: "1", unit: "Tag", tone: "critical" });
    expect(examTile([x], "2026-11-24")).toMatchObject({ label: "Klausur", value: "Heute" });
    expect(examTile([], "2026-10-11").caption).toBe("Keine geplant");
  });

  it("Wetter kompakt", () => {
    const wx = { place: "Wandlitz", current: { temp: 12.6, feelsLike: 11, code: 61, wind: 10, isDay: true }, hourly: [], daily: [{ day: "2026-10-12", code: 61, max: 14.2, min: 7.8, precipProb: 70 }], sunrise: "", sunset: "" };
    expect(plain(weatherTile(wx))).toEqual({ label: "Wandlitz", value: "13°", caption: "Regen · 8–14° · ☂︎ 70 %", tone: "normal" });
  });

  it("Emoji passt zur Tageszeit", () => {
    expect(greetingEmoji("Guten Morgen")).toBe("☀️");
    expect(greetingEmoji("Gute Nacht, Luis")).toBe("🌙");
    expect(greetingEmoji("Hallo")).toBe("👋");
  });
});
