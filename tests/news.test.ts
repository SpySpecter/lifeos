import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractOgImage, fetchableArticle, markLocal, mergeNews, parseFeed, safeImageUrl } from "@/integrations/news";

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

const rss = (item: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title><item><title>T</title><link>https://example.org/a</link>${item}</item></channel></rss>`;

describe("Vorschaubilder", () => {
  it("liest media:thumbnail", () => {
    const [i] = parseFeed(rss('<media:thumbnail url="https://img.example.org/a.jpg" width="100"/>'), "x");
    expect(i.image).toBe("https://img.example.org/a.jpg");
  });

  it("liest enclosure nur für Bilder", () => {
    expect(parseFeed(rss('<enclosure url="https://img.example.org/b.png" type="image/png" length="1"/>'), "x")[0].image).toBe(
      "https://img.example.org/b.png",
    );
    expect(parseFeed(rss('<enclosure url="https://cdn.example.org/a.mp3" type="audio/mpeg" length="1"/>'), "x")[0].image).toBeUndefined();
  });

  it("nimmt das erste <img> aus content:encoded (Tagesschau-Form)", () => {
    const item = rss(
      '<description>Kurz</description><content:encoded><![CDATA[<p><img src="https://images.tagesschau.de/x.jpg?width=1920&amp;q=1" alt="Bild" /></p>]]></content:encoded>',
    );
    expect(parseFeed(item, "Tagesschau")[0].image).toBe("https://images.tagesschau.de/x.jpg?width=320&q=1");
  });

  it("liest escaptes HTML im Atom-content (heise-Form)", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>H</title><link href="https://www.heise.de/n"/><updated>2026-10-11T10:00:00Z</updated><content type="html">&lt;img src="https://www.heise.de/scale/a.jpeg" class="webfeedsFeaturedVisual" /&gt;Text</content></entry></feed>`;
    expect(parseFeed(xml, "heise")[0].image).toBe("https://www.heise.de/scale/a.jpeg");
  });

  it("ohne Bild bleibt das Feld weg", () => {
    expect(parseFeed(rss("<description>nur Text</description>"), "x")[0]).not.toHaveProperty("image");
  });

  it("verwirft unsichere URLs", () => {
    expect(safeImageUrl("http://example.org/a.jpg")).toBeUndefined();
    expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeUndefined();
    expect(safeImageUrl("https://example.org/a.jpg")).toBe("https://example.org/a.jpg");
  });

  it("findet og:image und twitter:image", () => {
    expect(extractOgImage('<head><meta property="og:image" content="https://rbb24.de/a.jpg" /></head>')).toBe("https://rbb24.de/a.jpg");
    expect(extractOgImage("<meta content='https://x.org/t.png' name='twitter:image'>")).toBe("https://x.org/t.png");
    expect(extractOgImage('<meta property="og:title" content="x">')).toBeUndefined();
  });

  it("ruft nur öffentliche https-Seiten ab", () => {
    expect(fetchableArticle("https://www.rbb24.de/panorama/a.html")).toBe(true);
    expect(fetchableArticle("http://www.rbb24.de/a")).toBe(false);
    expect(fetchableArticle("https://127.0.0.1/a")).toBe(false);
    expect(fetchableArticle("https://localhost/a")).toBe(false);
    expect(fetchableArticle("https://lifeos.taila65db2.ts.net/")).toBe(false);
    expect(fetchableArticle("#")).toBe(false);
  });
});
