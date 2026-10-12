import { describe, expect, it, vi } from "vitest";
import { addMinutes, advance, clock, displayMs, focusedMs, nextRound, pause, resume, serverPhase, startTimer } from "@/components/focus/timer";
import { finishFocus, knownSubjects, runFocusPushes, startFocus, updateFocus } from "@/lib/focus";
import { savePlan, studyTime, todaysSessions, weekRange } from "@/lib/study";
import { memoryDb } from "./support/db";

const T0 = Date.parse("2026-10-12T08:00:00Z");
const MIN = 60_000;

describe("Timer", () => {
  const cfg = { subject: "Mathe", studySessionId: null, kind: "pomodoro" as const, workMin: 25, breakMin: 5 };

  it("Pomodoro: Fokus → Pause → wartet auf die nächste Runde", () => {
    let t = startTimer(cfg, T0);
    expect(displayMs(t, T0 + 10 * MIN)).toBe(15 * MIN);
    let r = advance(t, T0 + 26 * MIN);
    expect(r.events).toEqual(["workDone"]);
    t = r.timer;
    expect(t).toMatchObject({ phase: "break", rounds: 1, phaseEndsAt: T0 + 30 * MIN });
    expect(focusedMs(t, T0 + 26 * MIN)).toBe(25 * MIN);
    // lange weg: Pause auch vorbei, gezählt bleiben 25 Minuten
    r = advance(cfg && startTimer(cfg, T0), T0 + 3 * 60 * MIN);
    expect(r.events).toEqual(["workDone", "breakDone"]);
    expect(r.timer).toMatchObject({ phase: "ready", running: false });
    expect(focusedMs(r.timer, T0 + 3 * 60 * MIN)).toBe(25 * MIN);
    t = nextRound(r.timer, T0 + 4 * 60 * MIN);
    expect(serverPhase(t)).toEqual({ phase: "work", endsAt: T0 + 4 * 60 * MIN + 25 * MIN });
  });

  it("Anhalten friert Rest und Fokuszeit ein", () => {
    let t = pause(startTimer(cfg, T0), T0 + 10 * MIN);
    expect(serverPhase(t)).toEqual({ phase: null, endsAt: null });
    expect(displayMs(t, T0 + 60 * MIN)).toBe(15 * MIN);
    expect(focusedMs(t, T0 + 60 * MIN)).toBe(10 * MIN);
    t = addMinutes(resume(t, T0 + 60 * MIN), 5);
    expect(t.phaseEndsAt).toBe(T0 + 80 * MIN);
    expect(focusedMs(t, T0 + 70 * MIN)).toBe(20 * MIN);
  });

  it("Stoppuhr zählt hoch", () => {
    const t = startTimer({ ...cfg, kind: "frei", workMin: 0, breakMin: 0 }, T0);
    expect(advance(t, T0 + 5 * 60 * MIN).events).toEqual([]);
    expect(displayMs(t, T0 + 90 * MIN + 5000)).toBe(90 * MIN + 5000);
    expect(clock(90 * MIN + 5000)).toBe("1:30:05");
    expect(clock(5 * MIN)).toBe("5:00");
  });
});

describe("Fokus-Sitzungen", () => {
  it("Push genau einmal pro Phase, Minuten landen im Plan-gegen-Ist", async () => {
    const db = memoryDb();
    db.prepare("INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES ('https://web.push.apple.com/x', 'k', 'a', 0)").run();
    const plan = savePlan(db, { title: "Mathematik", subject: "LK", examDay: "2026-10-20", minutesPerDay: 45, materialIds: [] }, [
      { day: "2026-10-12", topic: "Ableitungen", tasks: [], minutes: 45 },
    ]);
    const [session] = todaysSessions(db, "2026-10-12");
    expect(session.planId).toBe(plan);

    const id = startFocus(db, { subject: "Mathematik", studySessionId: session.id, kind: "pomodoro", endsAt: T0 + 25 * MIN }, T0);
    const send = vi.fn(async () => undefined);
    expect(await runFocusPushes(db, T0 + 10 * MIN, send as never)).toBe(0);
    expect(await runFocusPushes(db, T0 + 25 * MIN, send as never)).toBe(1);
    expect(await runFocusPushes(db, T0 + 26 * MIN, send as never)).toBe(0);
    updateFocus(db, id, { phase: "break", endsAt: T0 + 30 * MIN, minutes: 25 });
    expect(await runFocusPushes(db, T0 + 31 * MIN, send as never)).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);

    finishFocus(db, id, 37.4, true, T0 + 40 * MIN);
    expect(todaysSessions(db, "2026-10-12")[0].done).toBe(true);
    // andere Schreibweise desselben Fachs zählt mit, unbekanntes Fach bekommt eine eigene Zeile
    finishFocus(db, startFocus(db, { subject: "mathematik ", studySessionId: null, kind: "frei", endsAt: null }, T0), 10);
    finishFocus(db, startFocus(db, { subject: "Englisch", studySessionId: null, kind: "frei", endsAt: null }, T0), 20);
    finishFocus(db, startFocus(db, { subject: "Kurz", studySessionId: null, kind: "frei", endsAt: null }, T0), 0.4);
    expect(studyTime(db, weekRange("2026-10-14", "Europe/Berlin"))).toEqual([
      { subject: "Mathematik", planned: 45, actual: 47 },
      { subject: "Englisch", planned: 0, actual: 20 },
    ]);
    expect(knownSubjects(db)).toEqual(expect.arrayContaining(["Mathematik", "Englisch"]));
    expect(knownSubjects(db)).not.toContain("Kurz");
  });

  it("Woche Mo–So in der App-Zeitzone", () => {
    expect(weekRange("2026-10-18", "Europe/Berlin")).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
      fromMs: Date.parse("2026-10-11T22:00:00Z"),
      toMs: Date.parse("2026-10-18T22:00:00Z"),
    });
  });
});
