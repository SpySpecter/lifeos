import { describe, expect, it } from "vitest";
import { defaultSettings, getSettings, setSetting } from "@/lib/settings";
import { costUsd, monthSpendUsd } from "@/lib/openai";
import { memoryDb } from "./support/db";

describe("Einstellungen", () => {
  it("liefert Standardwerte und speichert Änderungen", () => {
    const db = memoryDb();
    expect(getSettings(db)).toEqual(defaultSettings());
    setSetting(db, "displayName", "Luis");
    setSetting(db, "goals", { steps: 10000, sleep: 8, workout: 45, energy: 600 });
    setSetting(db, "defaultPlace", { name: "Wandlitz", lat: 52.74, lon: 13.46 });
    const s = getSettings(db);
    expect(s.displayName).toBe("Luis");
    expect(s.goals.steps).toBe(10000);
    expect(s.defaultPlace?.name).toBe("Wandlitz");
  });
});

describe("KI-Kosten", () => {
  it("rechnet gpt-6-luna-Preise", () => {
    expect(costUsd("gpt-6-luna", 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(costUsd("unbekannt", 1_000_000, 0)).toBeGreaterThan(1);
  });
  it("summiert nur den laufenden Monat (Monatsgrenze in APP_TZ, unabhängig von der Server-Zeitzone)", () => {
    const db = memoryDb();
    const ins = db.prepare("INSERT INTO llm_usage (at, model, purpose, input_tokens, output_tokens, cost_usd) VALUES (?, 'm', 'p', 0, 0, ?)");
    const now = new Date("2026-10-15T12:00:00+02:00");
    ins.run(Date.parse("2026-10-02T00:00:00+02:00"), 0.25);
    ins.run(Date.parse("2026-10-01T00:30:00+02:00"), 0.5); // in UTC noch September, in Berlin schon Oktober
    ins.run(Date.parse("2026-09-30T23:00:00+02:00"), 5);
    expect(monthSpendUsd(db, now)).toBeCloseTo(0.75);
  });
});
