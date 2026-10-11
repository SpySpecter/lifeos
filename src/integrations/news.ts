import "server-only";
import { XMLParser } from "fast-xml-parser";
import { newsFeeds } from "@/lib/env";
import { IntegrationError, type Integration } from "./core";

export type NewsItem = { title: string; link: string; published: string | null; source: string };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

type Node = Record<string, unknown>;
const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : v && typeof v === "object" && "#text" in v ? String((v as Node)["#text"]) : "";

/** Unterstützt RSS 2.0 (Tagesschau) und Atom (heise). */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const doc = parser.parse(xml) as Node;
  const rss = (doc.rss as Node | undefined)?.channel as Node | undefined;
  if (rss) {
    return asArray(rss.item as Node[]).map((item) => ({
      title: text(item.title).trim(),
      link: text(item.link).trim(),
      published: item.pubDate ? new Date(text(item.pubDate)).toISOString() : null,
      source,
    }));
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    return asArray(feed.entry as Node[]).map((entry) => {
      const links = asArray(entry.link as Node[]);
      const link = links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0];
      const date = entry.published ?? entry.updated;
      return {
        title: text(entry.title).trim(),
        link: link ? String(link["@href"] ?? "") : "",
        published: date ? new Date(text(date)).toISOString() : null,
        source,
      };
    });
  }
  throw new IntegrationError(`${source}: unbekanntes Feed-Format`);
}

export function mergeNews(lists: NewsItem[][], limit: number): NewsItem[] {
  // abwechselnd aus jeder Quelle, damit keine Quelle die Liste dominiert; innerhalb nach Datum
  const sorted = lists.map((l) =>
    l.filter((i) => i.title && i.link).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "")),
  );
  const out: NewsItem[] = [];
  for (let i = 0; out.length < limit && sorted.some((l) => l.length > i); i++) {
    for (const l of sorted) if (l[i] && out.length < limit) out.push(l[i]);
  }
  return out;
}

export const news: Integration<NewsItem[]> = {
  id: "news",
  ttlSeconds: 20 * 60,
  missingConfig: () => (newsFeeds().length ? null : { hint: "NEWS_FEEDS ist leer" }),
  async fetch() {
    const results = await Promise.allSettled(
      newsFeeds().map(async ({ name, url }) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (!res.ok) throw new IntegrationError(`${name}: HTTP ${res.status}`);
        return parseFeed(await res.text(), name);
      }),
    );
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!ok.length) throw new IntegrationError("Keine Nachrichtenquelle erreichbar");
    return mergeNews(ok, 10);
  },
  mock() {
    const now = Date.now();
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    return [
      { title: "Bundestag berät über neues Klimaschutzpaket", link: "#", published: at(25), source: "Tagesschau" },
      { title: "Open-Source-KI: Neue Modelle laufen auf dem Laptop", link: "#", published: at(40), source: "heise" },
      { title: "Bahn kündigt Ausbau im Regionalverkehr an", link: "#", published: at(70), source: "Tagesschau" },
      { title: "Linux 7.1 bringt bessere Akkulaufzeit", link: "#", published: at(95), source: "heise" },
      { title: "Herbstferien: Was Familien jetzt wissen müssen", link: "#", published: at(130), source: "Tagesschau" },
      { title: "Tailscale stellt neue Funktionen für Heimnetze vor", link: "#", published: at(180), source: "heise" },
    ];
  },
};
