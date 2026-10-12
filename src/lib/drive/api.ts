import "server-only";
import { isRateLimit, RETRY_DELAYS_MS } from "../mail/gmail";
import type { DriveFile } from "./policy";

const BASE = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(token: string, url: string, init: RequestInit = {}, delays = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
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
    throw new Error(`Drive ${res.status}: ${message.slice(0, 120)}`);
  }
}

type RawFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  createdTime: string;
  modifiedTime: string;
  viewedByMeTime?: string;
  starred?: boolean;
  shared?: boolean;
  parents?: string[];
  webViewLink?: string;
};

async function listAll(token: string, q: string, fields: string, max: number): Promise<RawFile[]> {
  const out: RawFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      pageSize: String(Math.min(1000, max - out.length)),
      fields: `nextPageToken,files(${fields})`,
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await call<{ files?: RawFile[]; nextPageToken?: string }>(token, `${BASE}?${params}`);
    out.push(...(res.files ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

/** Ordner-ID → Pfad ("Schule/Mathe"). Ordner außerhalb der eigenen Ablage (geteilt) bleiben unbekannt. */
export function folderPaths(folders: { id: string; name: string; parents?: string[] }[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const cache = new Map<string, string>();
  const resolve = (id: string, depth = 0): string => {
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    if (!f || depth > 20) return "";
    const parent = f.parents?.[0] ? resolve(f.parents[0], depth + 1) : "";
    const path = parent ? `${parent}/${f.name}` : f.name;
    cache.set(id, path);
    return path;
  };
  for (const f of folders) resolve(f.id);
  return cache;
}

/** Alle eigenen Dateien (ohne Ordner und Papierkorb) mit aufgelöstem Ordnerpfad. */
export async function listOwnFiles(token: string, max: number): Promise<DriveFile[]> {
  const folders = await listAll(token, `'me' in owners and trashed = false and mimeType = '${FOLDER}'`, "id,name,parents", 5000);
  const paths = folderPaths(folders);
  const files = await listAll(
    token,
    `'me' in owners and trashed = false and mimeType != '${FOLDER}'`,
    "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,viewedByMeTime,starred,shared,parents,webViewLink",
    max,
  );
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    mime: f.mimeType,
    path: (f.parents?.[0] && paths.get(f.parents[0])) || "",
    size: f.size === undefined ? null : Number(f.size),
    md5: f.md5Checksum ?? null,
    createdAt: Date.parse(f.createdTime),
    modifiedAt: Date.parse(f.modifiedTime),
    viewedAt: f.viewedByMeTime ? Date.parse(f.viewedByMeTime) : null,
    starred: Boolean(f.starred),
    shared: Boolean(f.shared),
    url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
  }));
}

/** In den Drive-Papierkorb (nach 30 Tagen löscht Google endgültig – bis dahin wiederherstellbar). */
export async function trashFile(token: string, id: string): Promise<void> {
  await call(token, `${BASE}/${encodeURIComponent(id)}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}

export async function untrashFile(token: string, id: string): Promise<void> {
  await call(token, `${BASE}/${encodeURIComponent(id)}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: false }) });
}
