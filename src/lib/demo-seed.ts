import type { DB } from "./db";
import { upsertHealth } from "./health";
import { lastDays, today } from "./time";

/** Deterministischer Zufall, damit Screenshots reproduzierbar bleiben. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DEMO_HABITS = [
  { name: "Lesen (20 min)", emoji: "📚", rate: 0.75 },
  { name: "Sport", emoji: "🏃", rate: 0.6 },
  { name: "Vokabeln", emoji: "🗣️", rate: 0.8 },
  { name: "Kein Handy nach 22 Uhr", emoji: "🌙", rate: 0.55 },
  { name: "2 Liter Wasser", emoji: "💧", rate: 0.85 },
];

/** Füllt die Demo-Datenbank mit plausiblen Daten der letzten 120 Tage (nur wenn sie leer ist). */
export function seedDemoData(db: DB, day: string = today()): void {
  const { latest } = db.prepare("SELECT MAX(day) AS latest FROM health").get() as { latest: string | null };
  if (latest === day) return;
  const rand = rng(42);
  const days = lastDays(day, 120);

  db.exec("BEGIN");
  try {
    // Demo-Daten sind immer relativ zu heute; veraltete Demo-Daten werden komplett neu erzeugt.
    db.exec("DELETE FROM habit_checks; DELETE FROM habits; DELETE FROM health;");
    DEMO_HABITS.forEach((h, pos) => {
      const res = db
        .prepare("INSERT INTO habits (name, emoji, position, created_at) VALUES (?, ?, ?, ?)")
        .run(h.name, h.emoji, pos, Date.now());
      const id = Number(res.lastInsertRowid);
      const insert = db.prepare("INSERT INTO habit_checks (habit_id, day) VALUES (?, ?)");
      for (const d of days) {
        if (d === day && pos > 1) continue; // ein paar Habits sind heute noch offen
        if (rand() < h.rate) insert.run(id, d);
      }
    });

    for (const d of days.slice(-60)) {
      if (d === day) {
        upsertHealth(db, d, { steps: 5230, sleep: 7.4, heart: 58, mood: 4 }, "demo");
        continue;
      }
      const weekend = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
      upsertHealth(
        db,
        d,
        {
          steps: Math.round(5500 + rand() * 7000 + (weekend ? 1500 : 0)),
          sleep: Math.round((6.2 + rand() * 2.4 + (weekend ? 0.8 : 0)) * 10) / 10,
          workout: rand() < 0.55 ? Math.round(20 + rand() * 60) : 0,
          energy: Math.round(300 + rand() * 450),
          heart: Math.round(55 + rand() * 8),
          mood: Math.min(5, Math.max(2, Math.round(3 + rand() * 2.2))),
        },
        "demo",
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
