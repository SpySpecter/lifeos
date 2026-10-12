import { describe, expect, it, vi } from "vitest";
import { addCards, createDeck, reviewCard } from "@/lib/flashcards";
import { finishFocus, startFocus } from "@/lib/focus";
import { addGrade, addGradeCourse } from "@/lib/grades";
import { addHabit, toggleHabit } from "@/lib/habits";
import { upsertHealth } from "@/lib/health";
import { savePlan } from "@/lib/study";
import {
  claimReviewPush,
  collectWeek,
  defaultWeek,
  getOrCreateReview,
  isoWeek,
  reviewDue,
  reviewInput,
  reviewPushMessage,
  ruleComment,
  weekLabel,
  weekStartOf,
} from "@/lib/weekly-review";
import { memoryDb } from "./support/db";

const TZ = "Europe/Berlin";
const MON = "2026-10-12";
const SUN = "2026-10-18";

describe("Wochen", () => {
  it("Montag, KW und Standardwoche", () => {
    expect(weekStartOf(SUN)).toBe(MON);
    expect(isoWeek(MON)).toBe(42);
    expect(isoWeek("2026-12-28")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(weekLabel(MON)).toBe("KW 42 · 12. Okt. – 18. Okt.");
    // sonntags die laufende Woche, sonst die letzte vollständige
    expect(defaultWeek(SUN)).toBe(MON);
    expect(defaultWeek("2026-10-14")).toBe("2026-10-05");
  });

  it("Push nur sonntags zur Uhrzeit (mit Nachholen) und genau einmal", () => {
    const cfg = { enabled: true, time: "18:00" };
    expect(reviewDue(cfg, SUN, "18:00")).toBe(true);
    expect(reviewDue(cfg, SUN, "20:59")).toBe(true);
    expect(reviewDue(cfg, SUN, "21:01")).toBe(false);
    expect(reviewDue(cfg, SUN, "17:59")).toBe(false);
    expect(reviewDue(cfg, "2026-10-17", "18:00")).toBe(false);
    expect(reviewDue({ ...cfg, enabled: false }, SUN, "18:00")).toBe(false);
    const db = memoryDb();
    expect(claimReviewPush(db, MON, 1)).toBe(true);
    expect(claimReviewPush(db, MON, 2)).toBe(false);
  });
});

describe("Rückblick", () => {
  function seeded() {
    const db = memoryDb();
    const read = addHabit(db, "Lesen", "📚");
    const room = addHabit(db, "Aufräumen", "🧹", null, { cadence: "weekly", intervalDays: null });
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]) toggleHabit(db, read, d);
    toggleHabit(db, room, "2026-10-17");
    savePlan(db, { title: "Mathematik", subject: "LK", examDay: "2026-10-30", minutesPerDay: 60, materialIds: [] }, [
      { day: "2026-10-13", topic: "Ableitungen", tasks: [], minutes: 60 },
      { day: "2026-10-15", topic: "Integrale", tasks: [], minutes: 60 },
    ]);
    const at = Date.parse("2026-10-13T15:00:00Z");
    finishFocus(db, startFocus(db, { subject: "Mathematik", studySessionId: null, kind: "pomodoro", endsAt: null }, at), 50, false, at);
    const lastWeek = Date.parse("2026-10-07T15:00:00Z");
    finishFocus(db, startFocus(db, { subject: "Mathematik", studySessionId: null, kind: "frei", endsAt: null }, lastWeek), 20, false, lastWeek);
    const deck = createDeck(db, { title: "Vokabeln" });
    addCards(db, deck, [{ front: "a", back: "b" }]);
    const card = (db.prepare("SELECT id FROM flashcards").get() as { id: number }).id;
    reviewCard(db, card, 1, at);
    reviewCard(db, card, 3, at + 60_000);
    for (const [d, h] of [
      ["2026-10-06", 8],
      ["2026-10-12", 7],
      ["2026-10-13", 6.5],
    ] as const)
      upsertHealth(db, d, { sleep: h }, "manual");
    const ma = addGradeCourse(db, { subject: "Mathematik", kind: "LK" });
    addGrade(db, { courseId: ma, semester: "Q1", kind: "klausur", points: 11, day: "2026-10-14", label: "1. Klausur" });
    return db;
  }

  it("sammelt Gewohnheiten, Lernzeit, Karten, Schlaf, Noten und Klausuren", () => {
    const r = collectWeek(seeded(), MON, SUN, TZ, [
      { label: "Mathematik", course: "LK", day: "2026-10-21" },
      { label: "Deutsch", course: null, day: "2026-11-02" },
    ]);
    expect(r.habits).toMatchObject([
      { name: "Lesen", covered: 5, days: 7, daily: true },
      { name: "Aufräumen", covered: 7, days: 7, daily: false, streak: 1, streakUnit: "Wochen" },
    ]);
    expect(r.habitRate).toBe(12 / 14);
    expect(r.study).toEqual([{ subject: "Mathematik", planned: 120, actual: 50 }]);
    expect([r.studyPlanned, r.studyActual, r.studyActualPrev]).toEqual([120, 50, 20]);
    expect(r.cards).toEqual({ reviews: 2, known: 1, cards: 1 });
    expect(r.sleep).toMatchObject({ avg: 6.75, nights: 2, prevAvg: 8 });
    expect(r.grades).toEqual([{ subject: "Mathematik", kind: "Klausur", points: 11, label: "1. Klausur" }]);
    expect(r.exams).toEqual([{ label: "Mathematik", course: "LK", day: "2026-10-21", inDays: 3 }]);
    expect(reviewInput(r)).toContain("Lernzeit: 50 Min. gemessen von 120 Min. geplant (Vorwoche 20 Min.)");

    const c = ruleComment(r);
    expect(c.good).toContain("🧹 Aufräumen: jeden Tag erledigt.");
    expect(c.next.some((t) => t.includes("42 %"))).toBe(true);
    expect(c.next.some((t) => t.includes("Mathematik"))).toBe(true);
    const msg = reviewPushMessage({ ...r, comment: c });
    expect(msg.body).toBe("Habits 86 % · 50 Min. gelernt · 2 Karten · Ø 6,8 h Schlaf");
    expect(msg.url).toBe("/rueckblick?woche=2026-10-12");
  });

  it("laufende Woche zählt nur bis heute", () => {
    const r = collectWeek(seeded(), MON, "2026-10-14", TZ, null);
    expect(r.until).toBe("2026-10-14");
    expect(r.habits[0]).toMatchObject({ covered: 3, days: 3 });
    expect(r.exams).toBeNull();
  });

  it("baut mit der KI und speichert; ein zweiter Aufruf nutzt den Speicher", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("openai")
        ? new Response(
            JSON.stringify({
              output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ headline: "Starke Woche", good: ["5× gelesen"], next: ["Mathe täglich 30 Min."] }) }] }],
              usage: { input_tokens: 500, output_tokens: 80 },
            }),
          )
        : new Response("{}", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const db = seeded();
    const r = await getOrCreateReview(db, MON, "2026-10-19", TZ);
    expect(r).toMatchObject({ ai: true, comment: { headline: "Starke Woche" }, until: SUN });
    const calls = fetchMock.mock.calls.filter(([u]) => String(u).includes("openai")).length;
    await getOrCreateReview(db, MON, "2026-10-20", TZ);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("openai")).length).toBe(calls);
    vi.unstubAllGlobals();
  });
});
