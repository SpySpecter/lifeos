import "server-only";
import type { NewsItem } from "@/integrations/news";
import type { DB } from "./db";
import { env } from "./env";
import { BudgetExceededError, structuredCompletion } from "./openai";
import { addDays, dayString } from "./time";

/**
 * Nachrichten fürs Morgenbriefing: Die KI wählt aus den Meldungen von gestern und heute die wichtigsten aus
 * und fasst sie in 1–2 Sätzen zusammen. Sie bekommt nur Titel und Anreißer (keine Artikel) und antwortet
 * mit der Nummer der Meldung – Link und Quelle kommen danach aus der Eingabe, erfinden kann sie also keine.
 */

export type DigestItem = { headline: string; summary: string; source: string; link: string; local: boolean };
export type NewsDigest = {
  items: DigestItem[];
  /** true = von der KI ausgewählt und zusammengefasst */
  ai: boolean;
  /** Hinweis, warum es nur Schlagzeilen gibt */
  note?: string;
};

const MAX_INPUT = 60;
const MAX_ITEMS = 7;

/** Meldungen seit gestern 0 Uhr (APP_TZ); Meldungen ohne Datum bleiben drin – Feeds liefern ohnehin nur Aktuelles. */
export function recentNews(items: NewsItem[], now: Date, tz: string): NewsItem[] {
  const yesterday = addDays(dayString(now, tz), -1);
  return items.filter((i) => !i.published || dayString(new Date(i.published), tz) >= yesterday).slice(0, MAX_INPUT);
}

/** Ohne KI: lokale Meldungen zuerst, sonst die Reihenfolge des Feeds (dort schon über Quellen gemischt). Blaulicht fliegt raus. */
export function headlineDigest(items: NewsItem[], note?: string): NewsDigest {
  const kept = items.filter((i) => i.category !== "Blaulicht");
  const ordered = [...kept.filter((i) => i.local), ...kept.filter((i) => !i.local)];
  return {
    items: ordered.slice(0, MAX_ITEMS).map((i) => ({
      headline: i.title,
      summary: i.summary ?? "",
      source: i.source,
      link: i.link,
      local: Boolean(i.local),
    })),
    ai: false,
    ...(note ? { note } : {}),
  };
}

export function digestInput(items: NewsItem[]): string {
  return items
    .map((i, n) => {
      const tags = [i.source, i.category, i.local ? "lokal" : null].filter(Boolean).join(" · ");
      return `[${n}] (${tags}) ${i.title}${i.summary ? ` — ${i.summary}` : ""}`;
    })
    .join("\n");
}

const INSTRUCTIONS = `Du stellst das Morgenbriefing für einen Oberstufenschüler aus Wandlitz (Landkreis Barnim, Brandenburg) zusammen.
Du bekommst nummerierte Meldungen von gestern und heute ([Nummer] (Quelle · Rubrik · lokal) Titel — Anreißer).
Wähle die 5 bis 7 wichtigsten aus: große Nachrichten aus Deutschland und der Welt, dazu Lokales aus Barnim/Wandlitz/Bernau/Brandenburg (mit „lokal“ markiert) und Wichtiges aus Tech/KI.
Fasse Meldungen zum selben Ereignis zu einer zusammen. Keine Boulevard- oder Blaulicht-Meldungen, außer sie betreffen die Region spürbar (z. B. Sperrungen, Ausfälle).
Für jede Auswahl: ref = Nummer der Meldung, headline = kurze sachliche Schlagzeile auf Deutsch (höchstens 80 Zeichen), summary = 1–2 Sätze auf Deutsch, nur mit Fakten aus Titel und Anreißer.
Sortiere nach Wichtigkeit.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "headline", "summary"],
        properties: { ref: { type: "integer" }, headline: { type: "string" }, summary: { type: "string" } },
      },
    },
  },
};

type DigestResponse = { items: { ref: number; headline: string; summary: string }[] };

/** Übernimmt nur Antworten, deren Nummer es in der Eingabe gibt – jede Meldung höchstens einmal. */
export function applyDigest(items: NewsItem[], res: DigestResponse): DigestItem[] {
  const used = new Set<number>();
  const out: DigestItem[] = [];
  for (const r of res.items) {
    const src = items[r.ref];
    if (!src || used.has(r.ref) || !r.headline.trim()) continue;
    used.add(r.ref);
    out.push({
      headline: r.headline.trim().slice(0, 140),
      summary: r.summary.trim().slice(0, 400),
      source: src.source,
      link: src.link,
      local: Boolean(src.local),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function summarizeNews(db: DB, items: NewsItem[], opts: { ai: boolean }): Promise<NewsDigest> {
  if (!items.length) return { items: [], ai: false };
  if (!opts.ai || !env().OPENAI_API_KEY) return headlineDigest(items);
  try {
    const res = await structuredCompletion<DigestResponse>(db, {
      purpose: "briefing-news",
      instructions: INSTRUCTIONS,
      input: digestInput(items),
      schemaName: "news_digest",
      schema: SCHEMA,
    });
    const picked = applyDigest(items, res);
    return picked.length ? { items: picked, ai: true } : headlineDigest(items, "Die KI hat keine Meldung ausgewählt.");
  } catch (err) {
    if (err instanceof BudgetExceededError) return headlineDigest(items, "KI-Monatsbudget erreicht – nur Schlagzeilen.");
    console.error("[briefing] News-Zusammenfassung", (err as Error).message);
    return headlineDigest(items, "KI gerade nicht erreichbar – nur Schlagzeilen.");
  }
}
