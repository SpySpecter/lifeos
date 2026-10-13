import type { DB } from "./db";

export type CacheHit<T> = { data: T; fetchedAt: number; stale: boolean };

/**
 * Liest `key` aus dem SQLite-Cache oder ruft `fn` auf. Schlägt `fn` fehl und gibt es einen alten Eintrag,
 * wird dieser als `stale` zurückgegeben – das Dashboard bleibt lesbar, wenn eine API kurz ausfällt.
 */
export async function cached<T>(
  db: DB,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  now: number = Date.now(),
): Promise<CacheHit<T>> {
  const row = db.prepare("SELECT value, fetched_at, expires_at FROM cache WHERE key = ?").get(key) as
    | { value: string; fetched_at: number; expires_at: number }
    | undefined;

  if (row && row.expires_at > now) {
    return { data: JSON.parse(row.value) as T, fetchedAt: row.fetched_at, stale: false };
  }

  try {
    const data = await fn();
    db.prepare(
      "INSERT INTO cache (key, value, fetched_at, expires_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at",
    ).run(key, JSON.stringify(data), now, now + ttlSeconds * 1000);
    return { data, fetchedAt: now, stale: false };
  } catch (err) {
    if (row) return { data: JSON.parse(row.value) as T, fetchedAt: row.fetched_at, stale: true };
    throw err;
  }
}

export function invalidate(db: DB, prefix: string): void {
  db.prepare("DELETE FROM cache WHERE key LIKE ?").run(`${prefix}%`);
}

/** Wie lange abgelaufene Einträge noch als Notfall-Rückfall (`stale`) dienen, bevor sie gelöscht werden. */
export const STALE_KEEP_MS = 14 * 86_400_000;

/**
 * Löscht Einträge, die seit mehr als `STALE_KEEP_MS` abgelaufen sind – sonst wächst die Tabelle ewig
 * (z. B. eine `ogimg:`-Zeile pro News-Artikel). Gibt die Zahl gelöschter Zeilen zurück.
 */
export function pruneCache(db: DB, now: number = Date.now()): number {
  return Number(db.prepare("DELETE FROM cache WHERE expires_at < ?").run(now - STALE_KEEP_MS).changes);
}
