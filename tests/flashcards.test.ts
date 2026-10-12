import { describe, expect, it } from "vitest";
import { addCards, createDeck, dayEnd, deleteDeck, dueCards, dueCount, getDeck, listDecks, reviewCard, reviewStats, updateCard } from "@/lib/flashcards";
import { againThisSession, intervalLabel, newCardState, previewIntervals, schedule } from "@/lib/fsrs";
import { memoryDb } from "./support/db";

const NOW = Date.parse("2026-10-12T08:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;

describe("FSRS", () => {
  it("neue Karte: Nochmal kommt in derselben Sitzung wieder, Einfach erst nach Tagen", () => {
    const s = newCardState(NOW);
    const again = schedule(s, 1, NOW);
    expect(again.due - NOW).toBeLessThan(10 * MIN);
    expect(againThisSession(again, NOW)).toBe(true);
    const easy = schedule(s, 4, NOW);
    expect(easy.state).toBe(2);
    expect(easy.due - NOW).toBeGreaterThan(DAY);
    expect(againThisSession(easy, NOW)).toBe(false);
  });

  it("Intervalle wachsen mit jeder guten Antwort", () => {
    let s = schedule(newCardState(NOW), 4, NOW);
    const first = s.due - NOW;
    s = schedule(s, 3, s.due);
    expect(s.scheduledDays * DAY).toBeGreaterThan(first);
    expect(s.reps).toBe(2);
  });

  it("Vorschau und Beschriftung", () => {
    const p = previewIntervals(newCardState(NOW), NOW);
    expect(p[1]).toBe("1 Min.");
    expect(p[4]).toMatch(/Tag|Tage|Wo\./);
    expect(intervalLabel(30 * 1000)).toBe("1 Min.");
    expect(intervalLabel(3 * 3600_000)).toBe("3 Std.");
    expect(intervalLabel(DAY)).toBe("1 Tag");
    expect(intervalLabel(21 * DAY)).toBe("3 Wo.");
    expect(intervalLabel(90 * DAY)).toBe("3 Mon.");
    expect(intervalLabel(547 * DAY)).toBe("1,5 J.");
  });
});

describe("Stapel und Karten", () => {
  it("zählt fällige Karten bis Tagesende, Lernkarten minutengenau", () => {
    const db = memoryDb();
    const deck = createDeck(db, { title: "Bio", subject: "Biologie" }, NOW);
    expect(addCards(db, deck, [{ front: "A", back: "a" }, { front: "B", back: "b" }, { front: " ", back: "x" }], NOW)).toBe(2);
    const end = dayEnd(NOW, "Europe/Berlin");
    expect(new Date(end).toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(dueCount(db, NOW, end)).toBe(2);

    const [a, b] = dueCards(db, deck, NOW, end);
    reviewCard(db, a.id, 1, NOW); // Lernschritt in 1 Minute
    reviewCard(db, b.id, 4, NOW); // erst in ein paar Tagen
    expect(dueCount(db, NOW, end)).toBe(0);
    expect(dueCount(db, NOW + 2 * MIN, end)).toBe(1);
    expect(listDecks(db, NOW, end)[0]).toMatchObject({ title: "Bio", total: 2, due: 0, fresh: 0 });
    expect(reviewStats(db, NOW - 1, NOW + 1)).toEqual({ reviews: 2, known: 1, cards: 2 });
  });

  it("bearbeiten, löschen samt Verlauf", () => {
    const db = memoryDb();
    const deck = createDeck(db, { title: "Vokabeln" }, NOW);
    addCards(db, deck, [{ front: "dog", back: "Hund", section: "Tiere" }], NOW);
    const [card] = getDeck(db, deck, NOW, NOW + DAY)!.cards;
    expect(card).toMatchObject({ section: "Tiere", state: 0 });
    updateCard(db, card.id, { front: "cat", back: "Katze" });
    reviewCard(db, card.id, 3, NOW);
    expect(getDeck(db, deck, NOW, NOW + DAY)!.cards[0]).toMatchObject({ front: "cat", back: "Katze", reps: 1 });
    deleteDeck(db, deck);
    expect(db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews").get()).toEqual({ n: 0 });
  });
});
