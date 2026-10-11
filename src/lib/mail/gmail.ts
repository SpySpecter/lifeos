import "server-only";
import { decodeEntities } from "@/integrations/google";
import { type Category, CATEGORY_LABEL, type MailMeta, parseFrom } from "./policy";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wartezeiten bei Gmail-Kontingentgrenzen (Limit gilt pro Minute) */
export const RETRY_DELAYS_MS = [2_000, 8_000, 20_000, 40_000];

export function isRateLimit(status: number, body: string): boolean {
  return status === 429 || (status === 403 && /rate ?limit|quota exceeded|userRateLimitExceeded/i.test(body));
}

async function call<T>(token: string, path: string, init: RequestInit = {}, delays = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const body = await res.text();
    if (isRateLimit(res.status, body) && attempt < delays.length) {
      await sleep(delays[attempt]);
      continue;
    }
    const message = (() => {
      try {
        return (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
      } catch {
        return body;
      }
    })();
    throw new Error(`Gmail ${res.status}: ${message.slice(0, 120)}`);
  }
}

/** IDs im Posteingang (standardmäßig ohne markierte), neueste zuerst. */
export async function listInbox(token: string, max: number, { includeStarred = false } = {}): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      q: includeStarred ? "in:inbox" : "in:inbox -is:starred",
      maxResults: String(Math.min(500, max - ids.length)),
    });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `/messages?${q}`);
    ids.push(...(res.messages ?? []).map((m) => m.id));
    pageToken = res.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

export async function getMeta(token: string, id: string): Promise<MailMeta> {
  const m = await call<{
    id: string;
    threadId: string;
    snippet: string;
    internalDate: string;
    labelIds?: string[];
    payload: { headers: { name: string; value: string }[] };
  }>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`);
  const h = (name: string) => m.payload.headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const from = parseFrom(h("From"));
  return {
    id: m.id,
    threadId: m.threadId,
    fromName: from.name,
    fromEmail: from.email,
    subject: h("Subject") || "(kein Betreff)",
    snippet: decodeEntities(m.snippet ?? ""),
    date: Number(m.internalDate),
    labels: m.labelIds ?? [],
    listUnsubscribe: Boolean(h("List-Unsubscribe")),
  };
}

async function labelIds(token: string, names: string[]): Promise<Map<string, string>> {
  const existing = await call<{ labels: { id: string; name: string }[] }>(token, "/labels");
  const byName = new Map(existing.labels.map((l) => [l.name, l.id]));
  for (const name of names) {
    if (byName.has(name)) continue;
    const created = await call<{ id: string }>(token, "/labels", {
      method: "POST",
      body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
    });
    byName.set(name, created.id);
  }
  return byName;
}

/** Label-IDs für "LifeOS/<Kategorie>", fehlende werden angelegt. */
export async function ensureLabels(token: string): Promise<Map<Category, string>> {
  const entries = Object.entries(CATEGORY_LABEL) as [Category, string][];
  const ids = await labelIds(token, entries.map(([, label]) => `LifeOS/${label}`));
  return new Map(entries.map(([cat, label]) => [cat, ids.get(`LifeOS/${label}`)!]));
}

/** ID eines einzelnen Labels, wird bei Bedarf angelegt. */
export async function ensureLabel(token: string, name: string): Promise<string> {
  return (await labelIds(token, [name])).get(name)!;
}

export async function modify(token: string, ids: string[], add: string[], remove: string[]): Promise<void> {
  if (!ids.length || (!add.length && !remove.length)) return;
  // batchModify erlaubt bis zu 1000 IDs pro Aufruf
  for (let i = 0; i < ids.length; i += 1000) {
    await call(token, "/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove }),
    });
  }
}

/** Papierkorb (Gmail löscht dort erst nach 30 Tagen endgültig). Endgültiges Löschen gibt es bewusst nicht. */
export const trash = (token: string, id: string) => call(token, `/messages/${id}/trash`, { method: "POST" });
export const untrash = (token: string, id: string) => call(token, `/messages/${id}/untrash`, { method: "POST" });
