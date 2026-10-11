import "server-only";
import { XMLParser } from "fast-xml-parser";
import { localKeywords, newsFeeds } from "@/lib/env";
import { IntegrationError, type Integration } from "./core";

export type NewsItem = {
  title: string;
  link: string;
  published: string | null;
  source: string;
  category: string;
  /** Meldung erwähnt einen Ort aus NEWS_LOCAL_KEYWORDS */
  local?: boolean;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

type Node = Record<string, unknown>;
const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : v && typeof v === "object" && "#text" in v ? String((v as Node)["#text"]) : "";
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Unterstützt RSS 2.0 (Tagesschau, rbb24) und Atom (heise, The Verge). */
export function parseFeed(xml: string, source: string, category = "Allgemein"): NewsItem[] {
  const doc = parser.parse(xml) as Node;
  const rss = (doc.rss as Node | undefined)?.channel as Node | undefined;
  if (rss) {
    return asArray(rss.item as Node[]).map((item) => ({
      title: decode(text(item.title).trim()),
      link: text(item.link).trim(),
      published: item.pubDate ? new Date(text(item.pubDate)).toISOString() : null,
      source,
      category,
    }));
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    return asArray(feed.entry as Node[]).map((entry) => {
      const links = asArray(entry.link as Node[]);
      const link = links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0];
      const date = entry.published ?? entry.updated;
      return {
        title: decode(text(entry.title).trim()),
        link: link ? String(link["@href"] ?? "") : "",
        published: date ? new Date(text(date)).toISOString() : null,
        source,
        category,
      };
    });
  }
  throw new IntegrationError(`${source}: unbekanntes Feed-Format`);
}

export function markLocal(items: NewsItem[], keywords: string[]): NewsItem[] {
  if (!keywords.length) return items;
  const re = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  return items.map((i) => (re.test(i.title) ? { ...i, local: true } : i));
}

/** Abwechselnd aus jeder Quelle (keine Quelle dominiert), Duplikate über den Titel entfernt, lokale Meldungen zuerst. */
export function mergeNews(lists: NewsItem[][], limit: number): NewsItem[] {
  const sorted = lists.map((l) =>
    l.filter((i) => i.title && i.link).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "")),
  );
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const add = (item: NewsItem | undefined) => {
    if (!item || out.length >= limit || seen.has(item.title)) return;
    seen.add(item.title);
    out.push(item);
  };
  sorted.flat().filter((i) => i.local).forEach(add);
  for (let i = 0; out.length < limit && sorted.some((l) => l.length > i); i++) sorted.forEach((l) => add(l[i]));
  return out;
}

export const news: Integration<NewsItem[]> = {
  id: "news",
  ttlSeconds: 20 * 60,
  missingConfig: () => (newsFeeds().length ? null : { hint: "NEWS_FEEDS ist leer" }),
  async fetch() {
    const results = await Promise.allSettled(
      newsFeeds().map(async ({ name, url, category }) => {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
          headers: { "User-Agent": "LifeOS dashboard (github.com/SpySpecter/lifeos)" },
        });
        if (!res.ok) throw new IntegrationError(`${name}: HTTP ${res.status}`);
        // pro Quelle nur die neuesten 15, damit große Feeds (heise: 150) nicht alles verdrängen
        return parseFeed(await res.text(), name, category).slice(0, 15);
      }),
    );
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [markLocal(r.value, localKeywords())] : []));
    if (!ok.length) throw new IntegrationError("Keine Nachrichtenquelle erreichbar");
    return mergeNews(ok, 60);
  },
  mock() {
    const now = Date.now();
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const N = (title: string, source: string, category: string, min: number, local = false): NewsItem => ({
      title,
      link: "#",
      published: at(min),
      source,
      category,
      ...(local ? { local } : {}),
    });
    return [
      N("Wandlitz: Neue Radwegverbindung nach Basdorf freigegeben", "rbb24", "Region", 15, true),
      N("Bundestag berät über neues Klimaschutzpaket", "Tagesschau Politik", "Politik", 25),
      N("Open-Source-KI: Neue Modelle laufen auf dem Laptop", "heise", "Tech", 40),
      N("Transporter prallt gegen Baum – Fahrer schwer verletzt", "rbb24 Blaulicht", "Blaulicht", 55),
      N("Bahn kündigt Ausbau im Regionalverkehr an", "Tagesschau", "Allgemein", 70),
      N("Apple and Google agree on new AI interoperability standard", "The Verge", "Tech", 95),
      N("Landtag Brandenburg streitet über Schulbudget", "rbb24", "Region", 130),
      N("Show HN: I built a self-hosted dashboard for my life", "Hacker News", "Tech", 150),
    ];
  },
};
