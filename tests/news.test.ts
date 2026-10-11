import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { markLocal, mergeNews, parseFeed } from "@/integrations/news";

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

describe("lokale Meldungen", () => {
  it("markiert Orte und stellt sie nach vorn", () => {
    const items = markLocal(
      [
        { title: "Unfall in Bernau", link: "a", published: "2026-10-01T00:00:00Z", source: "rbb24", category: "Region" },
        { title: "Bernauer Straße in Berlin", link: "b", published: "2026-10-02T00:00:00Z", source: "rbb24", category: "Region" },
        { title: "Etwas anderes", link: "c", published: "2026-10-03T00:00:00Z", source: "rbb24", category: "Region" },
      ],
      ["Bernau", "Wandlitz"],
    );
    expect(items.map((i) => Boolean(i.local))).toEqual([true, false, false]);
    expect(mergeNews([items], 3)[0].title).toBe("Unfall in Bernau");
  });

  it("entfernt doppelte Titel über Quellen hinweg", () => {
    const a = { title: "Gleich", link: "x", published: null, source: "A", category: "Allgemein" };
    expect(mergeNews([[a], [{ ...a, source: "B" }]], 5)).toHaveLength(1);
  });

  it("dekodiert HTML-Entities im Titel", () => {
    const xml = '<rss><channel><item><title>M&#228;nner &amp; Frauen</title><link>l</link></item></channel></rss>';
    expect(parseFeed(xml, "x")[0].title).toBe("Männer & Frauen");
  });
});
