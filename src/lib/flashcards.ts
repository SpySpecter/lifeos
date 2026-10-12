import "server-only";
import type { DB } from "./db";
import { newCardState, schedule, type CardState, type Rating } from "./fsrs";
import { addDays, today, zonedToEpoch } from "./time";

/**
 * Karteikarten in Stapeln, wiederholt mit FSRS. „Fällig“ heißt: bis Ende des Tages dran
 * (Karten in der Lernphase erst ab ihrer Minute), damit die Zahl morgens schon stimmt.
 */

export type Deck = {
  id: number;
  title: string;
  subject: string | null;
  materialId: number | null;
  createdAt: number;
  total: number;
  due: number;
  fresh: number;
};

export type Flashcard = CardState & { id: number; deckId: number; section: string | null; front: string; back: string };
export type NewCard = { front: string; back: string; section?: string | null };

/** Ende des heutigen Tages (Mitternacht) in der App-Zeitzone. */
export function dayEnd(now: number, tz: string): number {
  return zonedToEpoch(addDays(today(tz, new Date(now)), 1), "00:00", tz);
}

// Bedingung „fällig“: Lernkarten minutengenau, alles andere bis Tagesende
const due = (p = "") => `((${p}state IN (1, 3) AND ${p}due <= :now) OR (${p}state NOT IN (1, 3) AND ${p}due < :end))`;

type CardRow = {
  id: number;
  deck_id: number;
  section: string | null;
  front: string;
  back: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
};

const toCard = (r: CardRow): Flashcard => ({
  id: r.id,
  deckId: r.deck_id,
  section: r.section,
  front: r.front,
  back: r.back,
  due: r.due,
  stability: r.stability,
  difficulty: r.difficulty,
  elapsedDays: r.elapsed_days,
  scheduledDays: r.scheduled_days,
  learningSteps: r.learning_steps,
  reps: r.reps,
  lapses: r.lapses,
  state: r.state,
  lastReview: r.last_review,
});

const clean = (s: string, max: number) => s.replace(/\s+\n/g, "\n").trim().slice(0, max);

export function createDeck(db: DB, d: { title: string; subject?: string | null; materialId?: number | null }, now = Date.now()): number {
  const res = db
    .prepare("INSERT INTO flashcard_decks (title, subject, material_id, created_at) VALUES (?, ?, ?, ?)")
    .run(d.title.trim().slice(0, 120) || "Stapel", d.subject?.trim() || null, d.materialId ?? null, now);
  return Number(res.lastInsertRowid);
}

export function renameDeck(db: DB, id: number, d: { title: string; subject: string | null }): void {
  db.prepare("UPDATE flashcard_decks SET title = ?, subject = ? WHERE id = ?").run(d.title.trim().slice(0, 120), d.subject?.trim() || null, id);
}

export function deleteDeck(db: DB, id: number): void {
  db.prepare("DELETE FROM flashcard_decks WHERE id = ?").run(id);
}

/** Neue Karten sind sofort fällig (Zustand „neu“). Leere Karten werden übersprungen. */
export function addCards(db: DB, deckId: number, cards: NewCard[], now = Date.now()): number {
  const s = newCardState(now);
  const insert = db.prepare(
    `INSERT INTO flashcards (deck_id, section, front, back, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let n = 0;
  for (const c of cards) {
    const front = clean(c.front, 1000);
    const back = clean(c.back, 2000);
    if (!front || !back) continue;
    insert.run(deckId, c.section?.trim() || null, front, back, s.due, s.stability, s.difficulty, s.elapsedDays, s.scheduledDays, s.learningSteps, s.reps, s.lapses, s.state, s.lastReview, now);
    n++;
  }
  return n;
}

export function updateCard(db: DB, id: number, c: { front: string; back: string }): void {
  db.prepare("UPDATE flashcards SET front = ?, back = ? WHERE id = ?").run(clean(c.front, 1000), clean(c.back, 2000), id);
}

export function deleteCard(db: DB, id: number): void {
  db.prepare("DELETE FROM flashcards WHERE id = ?").run(id);
}

export function listDecks(db: DB, now: number, end: number): Deck[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.subject, d.material_id, d.created_at,
              COUNT(c.id) AS total,
              COALESCE(SUM(CASE WHEN c.id IS NOT NULL AND ${due("c.")} THEN 1 ELSE 0 END), 0) AS due,
              COALESCE(SUM(CASE WHEN c.state = 0 THEN 1 ELSE 0 END), 0) AS fresh
       FROM flashcard_decks d LEFT JOIN flashcards c ON c.deck_id = d.id
       GROUP BY d.id ORDER BY d.created_at DESC, d.id DESC`,
    )
    .all({ now, end }) as { id: number; title: string; subject: string | null; material_id: number | null; created_at: number; total: number; due: number; fresh: number }[];
  return rows.map((r) => ({ id: r.id, title: r.title, subject: r.subject, materialId: r.material_id, createdAt: r.created_at, total: r.total, due: r.due, fresh: r.fresh }));
}

export function getDeck(db: DB, id: number, now: number, end: number): (Deck & { cards: Flashcard[] }) | null {
  const deck = listDecks(db, now, end).find((d) => d.id === id);
  if (!deck) return null;
  const cards = (db.prepare("SELECT * FROM flashcards WHERE deck_id = ? ORDER BY id").all(id) as CardRow[]).map(toCard);
  return { ...deck, cards };
}

/** Fällige Karten eines Stapels (oder aller): Lernkarten zuerst, dann Wiederholungen, dann neue. */
export function dueCards(db: DB, deckId: number | null, now: number, end: number, limit = 200): Flashcard[] {
  const rows = db
    .prepare(
      `SELECT * FROM flashcards WHERE ${due()} AND (:deck IS NULL OR deck_id = :deck)
       ORDER BY CASE state WHEN 1 THEN 0 WHEN 3 THEN 0 WHEN 2 THEN 1 ELSE 2 END, due, id LIMIT :limit`,
    )
    .all({ now, end, deck: deckId, limit }) as CardRow[];
  return rows.map(toCard);
}

export function dueCount(db: DB, now: number, end: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM flashcards WHERE ${due()}`).get({ now, end }) as { n: number }).n;
}

/** Bewertung speichern und den neuen Zustand zurückgeben. */
export function reviewCard(db: DB, id: number, rating: Rating, now = Date.now()): Flashcard | null {
  const row = db.prepare("SELECT * FROM flashcards WHERE id = ?").get(id) as CardRow | undefined;
  if (!row) return null;
  const before = toCard(row);
  const next = schedule(before, rating, now);
  // Savepoint statt BEGIN: funktioniert auch innerhalb einer äußeren Transaktion (Demo-Seed)
  db.exec("SAVEPOINT review");
  try {
    db.prepare(
      `UPDATE flashcards SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?, learning_steps = ?,
       reps = ?, lapses = ?, state = ?, last_review = ? WHERE id = ?`,
    ).run(next.due, next.stability, next.difficulty, next.elapsedDays, next.scheduledDays, next.learningSteps, next.reps, next.lapses, next.state, next.lastReview, id);
    db.prepare("INSERT INTO flashcard_reviews (card_id, rating, state, reviewed_at) VALUES (?, ?, ?, ?)").run(id, rating, before.state, now);
    db.exec("RELEASE review");
  } catch (err) {
    db.exec("ROLLBACK TO review; RELEASE review");
    throw err;
  }
  return { ...before, ...next };
}

/** Wiederholungen in einem Zeitraum – für den Wochenrückblick. „Gewusst“ = nicht „Nochmal“. */
export function reviewStats(db: DB, from: number, to: number): { reviews: number; known: number; cards: number } {
  const r = db
    .prepare("SELECT COUNT(*) AS reviews, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS known, COUNT(DISTINCT card_id) AS cards FROM flashcard_reviews WHERE reviewed_at >= ? AND reviewed_at < ?")
    .get(from, to) as { reviews: number; known: number | null; cards: number };
  return { reviews: r.reviews, known: r.known ?? 0, cards: r.cards };
}
