import { createEmptyCard, fsrs, State, type Card, type Grade } from "ts-fsrs";

/**
 * Spaced Repetition mit FSRS (ts-fsrs). Rein und ohne DB, damit Server (speichern) und Client
 * (Intervall-Vorschau auf den Knöpfen) dieselbe Rechnung nutzen.
 */

export type Rating = 1 | 2 | 3 | 4; // nochmal, schwer, gut, einfach
export const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 1, label: "Nochmal" },
  { rating: 2, label: "Schwer" },
  { rating: 3, label: "Gut" },
  { rating: 4, label: "Einfach" },
];

/** FSRS-Zustand einer Karte, Zeiten in ms. */
export type CardState = {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 neu, 1 lernen, 2 wiederholen, 3 neu lernen */
  state: number;
  lastReview: number | null;
};

const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true });

const toCard = (s: CardState): Card => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  elapsed_days: s.elapsedDays,
  scheduled_days: s.scheduledDays,
  learning_steps: s.learningSteps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state as State,
  last_review: s.lastReview === null ? undefined : new Date(s.lastReview),
});

const fromCard = (c: Card): CardState => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: c.elapsed_days,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ? c.last_review.getTime() : null,
});

export const newCardState = (now: number): CardState => fromCard(createEmptyCard(new Date(now)));

export function schedule(s: CardState, rating: Rating, now: number): CardState {
  return fromCard(scheduler.next(toCard(s), new Date(now), rating as Grade).card);
}

/** In (Neu-)Lernphase: kommt noch in derselben Sitzung wieder dran. */
export const isLearning = (s: Pick<CardState, "state">) => s.state === State.Learning || s.state === State.Relearning;

/** Kommt die Karte noch in dieser Sitzung wieder (Lernschritt in den nächsten 30 Minuten)? */
export const againThisSession = (s: CardState, now: number) => isLearning(s) && s.due - now < 30 * 60_000;

/** „1 Min.“, „10 Min.“, „1 Tag“, „3 Wo.“, „2 Mon.“ */
export function intervalLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 14) return d === 1 ? "1 Tag" : `${d} Tage`;
  if (d < 60) return `${Math.round(d / 7)} Wo.`;
  if (d < 365) return `${Math.round(d / 30)} Mon.`;
  return `${(d / 365).toLocaleString("de-DE", { maximumFractionDigits: 1 })} J.`;
}

/** Was jeder Knopf bewirken würde – als Text unter dem Knopf. Ohne Fuzz, damit die Vorschau stabil bleibt. */
const preview = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false });
export function previewIntervals(s: CardState, now: number): Record<Rating, string> {
  const log = preview.repeat(toCard(s), new Date(now));
  const out = {} as Record<Rating, string>;
  for (const { rating } of RATINGS) out[rating] = intervalLabel(log[rating as Grade].card.due.getTime() - now);
  return out;
}
