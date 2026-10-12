/**
 * Zustand des Fokus-Timers – rein, ohne React. Die Zeit hängt nur an Zeitstempeln, damit sie nach dem
 * Neuladen oder nach Stunden im Hintergrund stimmt.
 */

export type FocusKind = "pomodoro" | "frei";
/** work = Fokus läuft, break = Pause, ready = Pause vorbei, wartet auf „Weiter“ */
export type Phase = "work" | "break" | "ready";

export type FocusTimer = {
  id: number | null;
  subject: string;
  studySessionId: number | null;
  kind: FocusKind;
  workMin: number;
  breakMin: number;
  phase: Phase;
  running: boolean;
  /** Ende der laufenden Phase (Pomodoro, läuft) */
  phaseEndsAt: number | null;
  /** Restzeit der Phase beim Pausieren */
  phaseLeft: number | null;
  /** Beginn des laufenden Fokus-Abschnitts */
  segmentStart: number | null;
  /** fokussierte Zeit ohne den laufenden Abschnitt */
  focusedMs: number;
  rounds: number;
};

export type TimerEvent = "workDone" | "breakDone";

const MIN = 60_000;

export function startTimer(cfg: { subject: string; studySessionId: number | null; kind: FocusKind; workMin: number; breakMin: number }, now: number): FocusTimer {
  return {
    id: null,
    ...cfg,
    phase: "work",
    running: true,
    phaseEndsAt: cfg.kind === "pomodoro" ? now + cfg.workMin * MIN : null,
    phaseLeft: null,
    segmentStart: now,
    focusedMs: 0,
    rounds: 0,
  };
}

export const focusedMs = (t: FocusTimer, now: number) =>
  t.focusedMs + (t.running && t.phase === "work" && t.segmentStart !== null ? Math.max(0, Math.min(now, t.phaseEndsAt ?? now) - t.segmentStart) : 0);

/** Angezeigte Zeit: Restzeit der Phase (Pomodoro) bzw. bisher fokussiert (Stoppuhr). */
export function displayMs(t: FocusTimer, now: number): number {
  if (t.kind === "frei") return focusedMs(t, now);
  if (t.phase === "ready") return 0;
  if (!t.running) return t.phaseLeft ?? 0;
  return Math.max(0, (t.phaseEndsAt ?? now) - now);
}

/** Phasen weiterschalten, die inzwischen abgelaufen sind (auch mehrere, z. B. nach langer Abwesenheit). */
export function advance(t: FocusTimer, now: number): { timer: FocusTimer; events: TimerEvent[] } {
  const events: TimerEvent[] = [];
  let cur = t;
  while (cur.running && cur.kind === "pomodoro" && cur.phaseEndsAt !== null && now >= cur.phaseEndsAt) {
    if (cur.phase === "work") {
      const end = cur.phaseEndsAt;
      cur = {
        ...cur,
        focusedMs: cur.focusedMs + Math.max(0, end - (cur.segmentStart ?? end)),
        segmentStart: null,
        rounds: cur.rounds + 1,
        phase: "break",
        phaseEndsAt: end + cur.breakMin * MIN,
      };
      events.push("workDone");
    } else {
      cur = { ...cur, phase: "ready", running: false, phaseEndsAt: null, phaseLeft: null };
      events.push("breakDone");
    }
  }
  return { timer: cur, events };
}

export function pause(t: FocusTimer, now: number): FocusTimer {
  if (!t.running) return t;
  return {
    ...t,
    focusedMs: focusedMs(t, now),
    segmentStart: null,
    running: false,
    phaseLeft: t.phaseEndsAt !== null ? Math.max(0, t.phaseEndsAt - now) : null,
    phaseEndsAt: null,
  };
}

export function resume(t: FocusTimer, now: number): FocusTimer {
  if (t.running || t.phase === "ready") return t;
  return {
    ...t,
    running: true,
    phaseEndsAt: t.phaseLeft !== null ? now + t.phaseLeft : null,
    phaseLeft: null,
    segmentStart: t.phase === "work" ? now : null,
  };
}

/** Nächste Fokus-Runde (nach der Pause oder Pause überspringen). */
export function nextRound(t: FocusTimer, now: number): FocusTimer {
  return { ...t, phase: "work", running: true, phaseEndsAt: now + t.workMin * MIN, phaseLeft: null, segmentStart: now };
}

export function addMinutes(t: FocusTimer, minutes: number): FocusTimer {
  if (t.phaseEndsAt !== null) return { ...t, phaseEndsAt: t.phaseEndsAt + minutes * MIN };
  if (t.phaseLeft !== null) return { ...t, phaseLeft: t.phaseLeft + minutes * MIN };
  return t;
}

/** Was der Server für den Push wissen muss. */
export const serverPhase = (t: FocusTimer): { phase: "work" | "break" | null; endsAt: number | null } =>
  t.running && t.phaseEndsAt !== null && t.phase !== "ready" ? { phase: t.phase, endsAt: t.phaseEndsAt } : { phase: null, endsAt: null };

export function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function phaseLabel(t: FocusTimer): string {
  if (t.kind === "frei") return t.running ? "Fokus" : "Pausiert";
  if (t.phase === "ready") return "Pause vorbei";
  if (t.phase === "break") return t.running ? "Pause" : "Pause · angehalten";
  return t.running ? `Fokus · Runde ${t.rounds + 1}` : "Angehalten";
}
