import { describe, expect, it } from "vitest";
import { healthSeries, ingestSchema, parseLooseNumber, upsertHealth } from "@/lib/health";
import { memoryDb } from "./support/db";

describe("parseLooseNumber (Werte aus iPhone-Kurzbefehlen)", () => {
  it.each([
    [7.5, 7.5],
    ["7,5", 7.5],
    ["7.5", 7.5],
    ["8.432", 8432],
    ["12.345,5", 12345.5],
    [" 58 ", 58],
    [["1000", "2.500", 300], 3800],
    ["", undefined],
    ["abc", undefined],
    [null, undefined],
  ])("%j → %j", (input, expected) => {
    expect(parseLooseNumber(input)).toBe(expected);
  });
});

describe("ingestSchema", () => {
  it("akzeptiert gemischte Formate", () => {
    const r = ingestSchema.parse({ date: "2026-10-11", steps: "8.432", sleep: "7,25" });
    expect(r).toMatchObject({ date: "2026-10-11", steps: 8432, sleep: 7.25 });
  });
  it("lehnt unbekannte Felder ab", () => {
    expect(ingestSchema.safeParse({ steps: 1, password: "x" }).success).toBe(false);
  });
  it("lehnt kaputte Datumswerte ab", () => {
    expect(ingestSchema.safeParse({ date: "11.10.2026" }).success).toBe(false);
  });
});

describe("upsertHealth", () => {
  it("speichert, überschreibt und baut Zeitreihen", () => {
    const db = memoryDb();
    expect(upsertHealth(db, "2026-10-10", { steps: 1000, sleep: 7 }, "manual")).toBe(2);
    upsertHealth(db, "2026-10-10", { steps: 2000 }, "shortcut");
    const s = healthSeries(db, ["2026-10-09", "2026-10-10"]);
    expect(s.steps).toEqual([null, 2000]);
    expect(s.sleep).toEqual([null, 7]);
  });
  it("lehnt unplausible Werte ab", () => {
    expect(() => upsertHealth(memoryDb(), "2026-10-10", { sleep: 30 }, "manual")).toThrow(/Schlaf/);
    expect(() => upsertHealth(memoryDb(), "2026-10-10", { steps: -1 }, "manual")).toThrow();
  });
});
