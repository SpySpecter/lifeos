import "server-only";
import type { DB } from "./db";
import { newCardState, schedule, type CardState, type Rating } from "./fsrs";
import { addDays, today, zonedToEpoch } from "./time";

/**
 * Karteikarten in Stapeln, wiederholt mit FSRS. „Fällig“ heißt: bis Ende des Tages dran
 * (Karten in der Lernphase erst ab ihrer Minute), damit die Zahl morgens schon stimmt.
 * Neue Karten kommen höchstens `newLeft` pro Tag dazu (wie in Anki), sonst wären nach einem
 * KI-Stapel mit 80 Karten alle 80 auf einmal fällig und die Wiederholungen stauen sich.
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

/** Beginn des heutigen Tages (Mitternacht) in der App-Zeitzone. */
export function dayStart(now: number, tz: string): number {
  return zonedToEpoch(today(tz, new Date(now)), "00:00", tz);
}

export const DEFAULT_NEW_PER_DAY = 20;

/** Wie viele neue Karten heute noch drankommen dürfen (heute schon zum ersten Mal gesehene zählen mit). */
export function newCardsLeft(db: DB, now: number, tz: string, perDay: number): number {
  const { n } = db
    .prepare("SELECT COUNT(DISTINCT card_id) AS n FROM flashcard_reviews WHERE state = 0 AND reviewed_at >= ?")
    .get(dayStart(now, tz)) as { n: number };
  return Math.max(0, perDay - n);
}

// Bedingung „fällig“ ohne neue Karten: Lernkarten minutengenau, Wiederholungen bis Tagesende
const due = (p = "") => `((${p}state IN (1, 3) AND ${p}due <= :now) OR (${p}state = 2 AND ${p}due < :end))`;
const fresh = (p = "") => `(${p}state = 0 AND ${p}due < :end)`;
/** SQLite: LIMIT -1 = unbegrenzt */
const sqlLimit = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : -1);

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

/** `due` je Stapel: fällige Wiederholungen plus neue Karten bis zum Tageslimit (`newLeft` gilt für alle Stapel zusammen). */
export function listDecks(db: DB, now: number, end: number, newLeft = Infinity): Deck[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.subject, d.material_id, d.created_at,
              COUNT(c.id) AS total,
              COALESCE(SUM(CASE WHEN c.id IS NOT NULL AND ${due("c.")} THEN 1 ELSE 0 END), 0) AS due,
              COALESCE(SUM(CASE WHEN c.id IS NOT NULL AND ${fresh("c.")} THEN 1 ELSE 0 END), 0) AS fresh_due,
              COALESCE(SUM(CASE WHEN c.state = 0 THEN 1 ELSE 0 END), 0) AS fresh
       FROM flashcard_decks d LEFT JOIN flashcards c ON c.deck_id = d.id
       GROUP BY d.id ORDER BY d.created_at DESC, d.id DESC`,
    )
    .all({ now, end }) as {
    id: number;
    title: string;
    subject: string | null;
    material_id: number | null;
    created_at: number;
    total: number;
    due: number;
    fresh_due: number;
    fresh: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    materialId: r.material_id,
    createdAt: r.created_at,
    total: r.total,
    due: r.due + Math.min(r.fresh_due, newLeft),
    fresh: r.fresh,
  }));
}

export function getDeck(db: DB, id: number, now: number, end: number, newLeft = Infinity): (Deck & { cards: Flashcard[] }) | null {
  const deck = listDecks(db, now, end, newLeft).find((d) => d.id === id);
  if (!deck) return null;
  const cards = (db.prepare("SELECT * FROM flashcards WHERE deck_id = ? ORDER BY id").all(id) as CardRow[]).map(toCard);
  return { ...deck, cards };
}

/** Fällige Karten eines Stapels (oder aller): Lernkarten zuerst, dann Wiederholungen, dann neue (bis `newLeft`). */
export function dueCards(db: DB, deckId: number | null, now: number, end: number, limit = 200, newLeft = Infinity): Flashcard[] {
  const known = db
    .prepare(
      `SELECT * FROM flashcards WHERE ${due()} AND (:deck IS NULL OR deck_id = :deck)
       ORDER BY CASE state WHEN 2 THEN 1 ELSE 0 END, due, id LIMIT :limit`,
    )
    .all({ now, end, deck: deckId, limit }) as CardRow[];
  const room = Math.min(limit - known.length, newLeft);
  const added = room > 0
    ? (db
        .prepare(`SELECT * FROM flashcards WHERE ${fresh()} AND (:deck IS NULL OR deck_id = :deck) ORDER BY due, id LIMIT :limit`)
        .all({ end, deck: deckId, limit: sqlLimit(room) }) as CardRow[])
    : [];
  return [...known, ...added].map(toCard);
}

export function dueCount(db: DB, now: number, end: number, newLeft = Infinity): number {
  const { known, added } = db
    .prepare(`SELECT COALESCE(SUM(${due()}), 0) AS known, COALESCE(SUM(${fresh()}), 0) AS added FROM flashcards`)
    .get({ now, end }) as { known: number; added: number };
  return known + Math.min(added, newLeft);
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
