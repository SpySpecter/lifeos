import { describe, expect, it, vi } from "vitest";
import { cached, invalidate, pruneCache, STALE_KEEP_MS } from "@/lib/cache";
import { memoryDb } from "./support/db";

describe("cached", () => {
  it("liefert innerhalb der TTL den Cache-Eintrag ohne erneuten Abruf", async () => {
    const db = memoryDb();
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    await cached(db, "k", 60, fn, 1_000);
    const hit = await cached(db, "k", 60, fn, 30_000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(hit).toEqual({ data: { n: 1 }, fetchedAt: 1_000, stale: false });
  });

  it("lädt nach Ablauf neu", async () => {
    const db = memoryDb();
    await cached(db, "k", 60, async () => 1, 0);
    const hit = await cached(db, "k", 60, async () => 2, 61_000);
    expect(hit.data).toBe(2);
  });

  it("fällt bei Fehlern auf alte Daten zurück und markiert sie als veraltet", async () => {
    const db = memoryDb();
    await cached(db, "k", 60, async () => "alt", 0);
    const hit = await cached(db, "k", 60, () => Promise.reject(new Error("down")), 120_000);
    expect(hit).toMatchObject({ data: "alt", stale: true });
  });

  it("wirft, wenn es keine alten Daten gibt", async () => {
    await expect(cached(memoryDb(), "k", 60, () => Promise.reject(new Error("down")))).rejects.toThrow("down");
  });

  it("invalidate löscht nach Präfix", async () => {
    const db = memoryDb();
    await cached(db, "news:default", 60, async () => 1, 0);
    await cached(db, "github:default", 60, async () => 1, 0);
    invalidate(db, "news:");
    const fn = vi.fn().mockResolvedValue(2);
    await cached(db, "news:default", 60, fn, 1);
    await cached(db, "github:default", 60, fn, 1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pruneCache löscht nur lange abgelaufene Einträge und behält den Rückfall", async () => {
    const db = memoryDb();
    await cached(db, "alt", 60, async () => 1, 0);
    await cached(db, "frisch-abgelaufen", 60, async () => 1, STALE_KEEP_MS);
    await cached(db, "gültig", 60, async () => 1, STALE_KEEP_MS + 61_000);
    expect(pruneCache(db, STALE_KEEP_MS + 61_000)).toBe(1);
    const keys = (db.prepare("SELECT key FROM cache ORDER BY key").all() as { key: string }[]).map((r) => r.key);
    expect(keys).toEqual(["frisch-abgelaufen", "gültig"]);
  });
});
