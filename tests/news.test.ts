import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeNews, parseFeed } from "@/integrations/news";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseFeed", () => {
  it("liest RSS 2.0 (Tagesschau)", () => {
    const items = parseFeed(fixture("tagesschau.xml"), "Tagesschau");
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ title: "Zweite Meldung & mehr", source: "Tagesschau" });
    expect(items[0].published).toBe("2026-10-11T16:30:00.000Z");
  });

  it("liest Atom (heise) inkl. Fallback auf updated", () => {
    const items = parseFeed(fixture("heise.xml"), "heise");
    expect(items[0]).toMatchObject({ title: "Neue Linux-Version", link: "https://www.heise.de/news/linux-1.html" });
    expect(items[1].published).toBe("2026-10-11T10:00:00.000Z");
  });

  it("wirft bei unbekanntem Format", () => {
    expect(() => parseFeed("<html></html>", "x")).toThrow();
  });
});

describe("mergeNews", () => {
  it("wechselt zwischen Quellen ab und begrenzt", () => {
    const a = parseFeed(fixture("tagesschau.xml"), "Tagesschau");
    const b = parseFeed(fixture("heise.xml"), "heise");
    const merged = mergeNews([a, b], 3);
    expect(merged.map((m) => m.source)).toEqual(["Tagesschau", "heise", "Tagesschau"]);
  });
});
