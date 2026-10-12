import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, moveWidget, normalizeLayout, setWidgetMode, WIDGET_IDS } from "@/lib/dashboard";

describe("Heute-Seite anpassen", () => {
  it("Standard: Heute-Relevantes groß, Rest als Kachel, jedes Widget genau einmal", () => {
    expect(DEFAULT_LAYOUT.map((w) => w.id).sort()).toEqual([...WIDGET_IDS].sort());
    expect(DEFAULT_LAYOUT.filter((w) => w.mode === "large").map((w) => w.id)).toEqual(["school", "exams", "habits", "weather", "calendar"]);
  });

  it("bereinigt gespeicherte Layouts: Unbekanntes und Doppeltes raus, Fehlendes hinten an", () => {
    const out = normalizeLayout([
      { id: "news", mode: "large" },
      { id: "news", mode: "hidden" },
      { id: "quatsch", mode: "large" },
      { id: "music", mode: "kaputt" },
    ]);
    expect(out.slice(0, 2)).toEqual([
      { id: "news", mode: "large" },
      { id: "music", mode: "compact" },
    ]);
    expect(out).toHaveLength(WIDGET_IDS.length);
    expect(normalizeLayout("kein array")).toEqual(DEFAULT_LAYOUT);
  });

  it("verschiebt und ändert die Darstellung", () => {
    const moved = moveWidget(DEFAULT_LAYOUT, "exams", -1);
    expect(moved.slice(0, 2).map((w) => w.id)).toEqual(["exams", "school"]);
    expect(moveWidget(DEFAULT_LAYOUT, "school", -1)).toBe(DEFAULT_LAYOUT);
    expect(setWidgetMode(DEFAULT_LAYOUT, "github", "hidden").find((w) => w.id === "github")?.mode).toBe("hidden");
  });
});
