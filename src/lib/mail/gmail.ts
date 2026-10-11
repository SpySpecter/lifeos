import "server-only";
import { decodeEntities } from "@/integrations/google";
import { type Category, CATEGORY_LABEL, type MailMeta, parseFrom } from "./policy";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** IDs im Posteingang (ohne markierte), neueste zuerst. */
export async function listInbox(token: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ q: "in:inbox -is:starred", maxResults: String(Math.min(100, max - ids.length)) });
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

/** Label-IDs für "LifeOS/<Kategorie>", fehlende werden angelegt. */
export async function ensureLabels(token: string): Promise<Map<Category, string>> {
  const existing = await call<{ labels: { id: string; name: string }[] }>(token, "/labels");
  const byName = new Map(existing.labels.map((l) => [l.name, l.id]));
  const out = new Map<Category, string>();
  for (const [cat, label] of Object.entries(CATEGORY_LABEL) as [Category, string][]) {
    const name = `LifeOS/${label}`;
    let id = byName.get(name);
    if (!id) {
      const created = await call<{ id: string }>(token, "/labels", {
        method: "POST",
        body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
      });
      id = created.id;
    }
    out.set(cat, id);
  }
  return out;
}

export async function modify(token: string, ids: string[], add: string[], remove: string[]): Promise<void> {
  if (!ids.length || (!add.length && !remove.length)) return;
  for (let i = 0; i < ids.length; i += 500) {
    await call(token, "/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(i, i + 500), addLabelIds: add, removeLabelIds: remove }),
    });
  }
}

/** Papierkorb (Gmail löscht dort erst nach 30 Tagen endgültig). Endgültiges Löschen gibt es bewusst nicht. */
export const trash = (token: string, id: string) => call(token, `/messages/${id}/trash`, { method: "POST" });
export const untrash = (token: string, id: string) => call(token, `/messages/${id}/untrash`, { method: "POST" });
