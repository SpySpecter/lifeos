import type { DB } from "./db";
import { upsertHealth } from "./health";
import { addDays, lastDays, today } from "./time";

/** Deterministischer Zufall, damit Screenshots reproduzierbar bleiben. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DEMO_MATERIAL = `# Sortieralgorithmen
Sortierverfahren ordnen die Elemente einer Liste nach einem Schlüssel.

## Bubblesort
Benachbarte Elemente werden verglichen und getauscht, bis keine Vertauschung mehr nötig ist. Laufzeit O(n²).

## Selectionsort
Das kleinste Element des unsortierten Rests wird gesucht und nach vorne getauscht. Laufzeit immer O(n²).

## Quicksort
Ein Pivot-Element teilt die Liste in kleinere und größere Elemente, die rekursiv sortiert werden. Im Mittel O(n log n), im schlechtesten Fall O(n²).

## Mergesort
Die Liste wird halbiert, beide Hälften rekursiv sortiert und anschließend zusammengeführt. Laufzeit O(n log n), stabil.

## Stabilität
Ein Verfahren ist stabil, wenn gleiche Schlüssel ihre ursprüngliche Reihenfolge behalten.`;

const DEMO_CARDS = `# Sortieralgorithmen
Laufzeit von Bubblesort im schlechtesten Fall? == O(n²)
Wie teilt Quicksort die Liste auf? == Über ein Pivot-Element in kleinere und größere Elemente
Was bedeutet „stabil“ bei Sortierverfahren? == Gleiche Schlüssel behalten ihre ursprüngliche Reihenfolge
Welches Verfahren ist immer O(n log n) und stabil? == Mergesort`;

/** Lernplan für die Demo: Informatik-Klausur in 9 Tagen, vorgestern erledigt, gestern liegengeblieben. */
function seedStudy(db: DB, day: string): void {
  db.exec("DELETE FROM flashcard_sets; DELETE FROM study_sessions; DELETE FROM study_plans; DELETE FROM study_materials;");
  const now = Date.now();
  const material = Number(
    db
      .prepare("INSERT INTO study_materials (title, subject, content, created_at) VALUES (?, ?, ?, ?)")
      .run("Sortieralgorithmen", "Informatik", DEMO_MATERIAL, now).lastInsertRowid,
  );
  const plan = Number(
    db
      .prepare("INSERT INTO study_plans (title, subject, exam_day, minutes_per_day, material_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("Informatik", "LK", addDays(day, 9), 45, JSON.stringify([material]), now).lastInsertRowid,
  );
  const topics: [string, string[]][] = [
    ["Überblick: Sortierverfahren", ["Zusammenfassung lesen", "Begriffe Stabilität und Laufzeit klären"]],
    ["Bubblesort und Selectionsort", ["Beide von Hand an einer Liste mit 6 Zahlen durchspielen"]],
    ["Quicksort", ["Pivot-Wahl verstehen", "Rekursion an einem Beispiel aufschreiben"]],
    ["Mergesort", ["Teilen und Zusammenführen skizzieren", "Laufzeit begründen"]],
    ["Wiederholung: Laufzeiten vergleichen", ["Tabelle best/average/worst case ausfüllen", "Karteikarten durchgehen"]],
    ["Übungsaufgaben", ["Zwei alte Klausuraufgaben lösen"]],
    ["Stabilität und Vergleich", ["Beispiele für stabile und instabile Verfahren finden"]],
    ["Generalprobe", ["Probeklausur unter Zeitdruck", "Fehler nacharbeiten"]],
  ];
  const insert = db.prepare("INSERT INTO study_sessions (plan_id, day, topic, tasks, minutes, done) VALUES (?, ?, ?, ?, ?, ?)");
  topics.forEach(([topic, tasks], i) => insert.run(plan, addDays(day, i - 2), topic, JSON.stringify(tasks), i === 7 ? 60 : 45, i === 0 ? 1 : 0));
  db.prepare("INSERT INTO flashcard_sets (material_id, title, content, created_at) VALUES (?, ?, ?, ?)").run(material, "Sortieralgorithmen", DEMO_CARDS, now);
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

    seedStudy(db, day);

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
