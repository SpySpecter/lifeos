import { describe, expect, it } from "vitest";
import { addDays, greeting, lastDays, today } from "@/lib/time";

describe("Zeit", () => {
  it("grüßt passend zur Uhrzeit in Berlin", () => {
    expect(greeting(new Date("2026-10-11T06:30:00Z"))).toBe("Guten Morgen"); // 08:30 MESZ
    expect(greeting(new Date("2026-10-11T11:00:00Z"))).toBe("Hallo");
    expect(greeting(new Date("2026-10-11T17:30:00Z"))).toBe("Guten Abend"); // 19:30
    expect(greeting(new Date("2026-10-11T21:30:00Z"))).toBe("Gute Nacht"); // 23:30
  });
  it("rechnet Tage zeitzonensicher", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28"); // Zeitumstellung
    expect(lastDays("2026-10-11", 3)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
  });
  it("bestimmt das heutige Datum in der Zielzeitzone", () => {
    expect(today("Europe/Berlin", new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12");
  });
});
