import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addMaterial,
  countCards,
  deleteMaterial,
  deletePlan,
  generateFlashcards,
  generateStudyPlan,
  getPlan,
  listFlashcardSets,
  listMaterials,
  listPlans,
  materialContext,
  openStudyMinutes,
  outline,
  prepareMaterial,
  remNoteText,
  saveFlashcardSet,
  savePlan,
  studyDays,
  todaysSessions,
  toggleSession,
  toRemNote,
  validateSessions,
} from "@/lib/study";
import { seedDemoData } from "@/lib/demo-seed";
import { memoryDb } from "./support/db";

const DAY = "2026-10-12"; // Montag
const ZWSP = "\u200B";

beforeAll(() => {
  process.env.OPENAI_API_KEY = "sk-test";
});
afterEach(() => vi.unstubAllGlobals());

const aiAnswer = (answer: unknown) =>
  vi.fn(async () =>
    new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }],
        usage: { input_tokens: 4000, output_tokens: 900 },
      }),
    ),
  );

describe("Material vorbereiten", () => {
  it("wirft Bilder, Kommentare, Link-Ziele, Seitenzahlen und Kopfzeilen raus", () => {
    const header = "Arbeitsblatt Analysis – Herr Krause";
    const md = [
      "\uFEFF# Ableitungen",
      header,
      "Die [Ableitung](https://example.org/a(b)) gibt die Steigung an. ![Graph](data:image/png;base64,AAAA)",
      "<!-- Seite 1 -->",
      "",
      "",
      "",
      "3",
      header,
      "## Produktregel",
      "Seite 4 von 10",
      header,
      "| a | b |",
      "| a | b |",
      "| a | b |",
      "| a | b |",
      header,
      '<img src="x.png">',
    ].join("\r\n");
    expect(prepareMaterial(md)).toBe(
      ["# Ableitungen", header, "Die Ableitung gibt die Steigung an.", "", "## Produktregel", "", "| a | b |", "| a | b |", "| a | b |", "| a | b |"].join("\n"),
    );
  });

  it("kürzt zu viel Material anteilig", () => {
    const { text, truncated } = materialContext(
      [
        { title: "A", content: "a".repeat(300) },
        { title: "B", content: "b".repeat(100) },
      ],
      200,
    );
    expect(truncated).toBe(true);
    expect(text).toContain(`## Material: A\n\n${"a".repeat(150)}\n[… gekürzt]`);
    expect(text).toContain(`## Material: B\n\n${"b".repeat(50)}\n[… gekürzt]`);
  });

  it("liest Überschriften mit erstem Satz", () => {
    expect(outline("# Kapitel\nEinleitung. Mehr Text.\n## *Teil* 2\n- Punkt eins\n")).toEqual([
      { heading: "Kapitel", text: "Einleitung." },
      { heading: "Teil 2", text: "Punkt eins" },
    ]);
  });
});

describe("RemNote", () => {
  it("eine Zeile pro Karte, Überschrift pro Abschnitt", () => {
    const out = toRemNote([
      { heading: "## Ableitungen", cards: [{ front: "Was ist f'(x)?", back: "Die Steigung\nder Tangente" }, { front: " ", back: "leer" }] },
      { heading: "Leer", cards: [] },
      { heading: "", cards: [{ front: "Produktregel", back: "(uv)' = u'v + uv'" }] },
    ]);
    expect(out).toBe("# Ableitungen\nWas ist f'(x)? == Die Steigung · der Tangente\n\nProduktregel == (uv)' = u'v + uv'");
    expect(countCards(out)).toBe(2);
  });

  it("entschärft RemNote-Trenner innerhalb einer Karte", () => {
    expect(remNoteText("x == y")).toBe(`x =${ZWSP}= y`);
    expect(remNoteText("a === b")).toBe(`a =${ZWSP}=${ZWSP}= b`);
    expect(remNoteText("cin >> x; std::cout << y <> z;;")).toBe(
      `cin >${ZWSP}> x; std:${ZWSP}:cout <${ZWSP}< y <${ZWSP}> z;${ZWSP};`,
    );
    const line = toRemNote([{ heading: "", cards: [{ front: "Vergleich in Java?", back: "a == b" }] }]);
    expect(line.split(" == ")).toHaveLength(2);
  });
});

describe("Lernplan", () => {
  it("Lerntage bis zum Vortag der Klausur, ohne freie Wochentage", () => {
    expect(studyDays(DAY, "2026-10-19", [0, 6])).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(studyDays(DAY, DAY, [])).toEqual([]);
    expect(studyDays(DAY, "2027-06-01", [])).toHaveLength(60);
    expect(studyDays(DAY, "2027-06-01", []).at(-1)).toBe("2027-05-31");
  });

  it("verwirft Tage außerhalb des Plans und begrenzt die Minuten", () => {
    const days = ["2026-10-12", "2026-10-13"];
    expect(
      validateSessions(
        [
          { day: "2026-10-13", topic: " Üben ", tasks: [" A ", ""], minutes: 500 },
          { day: "2026-10-20", topic: "Nach der Klausur", tasks: [], minutes: 30 },
          { day: "2026-10-12", topic: "Start", tasks: [], minutes: 2 },
          { day: "2026-10-12", topic: "doppelt", tasks: [], minutes: 30 },
          { day: "2026-10-13", topic: "", tasks: [], minutes: 30 },
        ],
        days,
        45,
      ),
    ).toEqual([
      { day: "2026-10-12", topic: "Start", tasks: [], minutes: 10 },
      { day: "2026-10-13", topic: "Üben", tasks: ["A"], minutes: 45 },
    ]);
  });

  it("fragt die KI mit Lerntagen und Material und prüft die Antwort", async () => {
    const db = memoryDb();
    const m = addMaterial(db, { title: "Analysis", subject: "Mathematik", content: "# Ableitungen\nText" });
    const fetchMock = aiAnswer({
      sessions: [
        { day: "2026-10-12", topic: "Ableitungen", tasks: ["Regeln lernen"], minutes: 40 },
        { day: "2026-10-14", topic: "Klausurtag", tasks: [], minutes: 40 },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const sessions = await generateStudyPlan(
      db,
      { title: "Mathematik", subject: "LK", examDay: "2026-10-14", minutesPerDay: 45, freeWeekdays: [], materialIds: [m] },
      DAY,
    );
    expect(sessions).toEqual([{ day: "2026-10-12", topic: "Ableitungen", tasks: ["Regeln lernen"], minutes: 40 }]);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.input).toContain("Lerntage: 2026-10-12 (Mo), 2026-10-13 (Di)");
    expect(body.input).toContain("## Material: Analysis\n\n# Ableitungen");
    expect((db.prepare("SELECT purpose FROM llm_usage").get() as { purpose: string }).purpose).toBe("study-plan");
  });

  it("ohne Lerntag gar nicht erst fragen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const req = { title: "x", subject: null, examDay: DAY, minutesPerDay: 30, freeWeekdays: [], materialIds: [] };
    await expect(generateStudyPlan(memoryDb(), req, DAY)).rejects.toThrow("kein Lerntag");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("speichert Pläne, zählt Fortschritt und zeigt heute + Liegengebliebenes", () => {
    const db = memoryDb();
    const id = savePlan(db, { title: "Mathe", subject: null, examDay: "2026-10-20", minutesPerDay: 45, materialIds: [] }, [
      { day: "2026-10-08", topic: "zu alt", tasks: [], minutes: 30 },
      { day: "2026-10-10", topic: "verpasst", tasks: ["a"], minutes: 30 },
      { day: "2026-10-11", topic: "erledigt", tasks: [], minutes: 30 },
      { day: DAY, topic: "heute", tasks: [], minutes: 30 },
      { day: "2026-10-13", topic: "morgen", tasks: [], minutes: 30 },
    ]);
    const plan = getPlan(db, id)!;
    toggleSession(db, plan.sessions[2].id);
    expect(todaysSessions(db, DAY).map((s) => [s.topic, s.overdue, s.planTitle])).toEqual([
      ["verpasst", true, "Mathe"],
      ["heute", false, "Mathe"],
    ]);
    expect(listPlans(db)[0]).toMatchObject({ total: 5, done: 1, nextDay: "2026-10-08" });
    // nach der Klausur verschwinden die Einheiten aus „Heute“
    expect(todaysSessions(db, "2026-10-21")).toEqual([]);
    deletePlan(db, id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM study_sessions").get()).toEqual({ n: 0 });
  });
});

describe("Karteikarten", () => {
  it("erstellt Karten mit der KI und speichert sie als RemNote-Text", async () => {
    const db = memoryDb();
    const m = addMaterial(db, { title: "Weimar", subject: "Geschichte", content: "# Krisenjahr 1923\nInflation." });
    vi.stubGlobal(
      "fetch",
      aiAnswer({ sections: [{ heading: "Krisenjahr 1923", cards: [{ front: "Wann war die Hyperinflation?", back: "1923" }] }] }),
    );
    const set = await generateFlashcards(db, m, 20);
    expect(set).toEqual({ title: "Weimar", content: "# Krisenjahr 1923\nWann war die Hyperinflation? == 1923" });
    saveFlashcardSet(db, { materialId: m, ...set });
    expect(listFlashcardSets(db)[0]).toMatchObject({ title: "Weimar", cards: 1, materialId: m });
    expect(listMaterials(db)[0]).toMatchObject({ title: "Weimar", chars: 28 });
    // Material löschen lässt die Karten stehen
    deleteMaterial(db, m);
    expect(listFlashcardSets(db)[0]).toMatchObject({ materialId: null, cards: 1 });
  });
});

describe("Demo-Daten", () => {
  it("legen Material, Plan mit Liegengebliebenem und RemNote-Karten an – auch beim Neu-Seeden nur einmal", () => {
    const db = memoryDb();
    seedDemoData(db, DAY);
    db.exec("DELETE FROM health"); // erzwingt erneutes Seeden
    seedDemoData(db, DAY);
    expect(listMaterials(db)).toHaveLength(1);
    expect(todaysSessions(db, DAY).map((s) => [s.topic, s.overdue])).toEqual([
      ["Bubblesort und Selectionsort", true],
      ["Quicksort", false],
    ]);
    expect(openStudyMinutes(db, DAY)).toBe(90);
    const [set] = listFlashcardSets(db);
    expect(set.cards).toBe(4);
    expect(set.content.split("\n").slice(1).every((l) => l.split(" == ").length === 2)).toBe(true);
  });
});
