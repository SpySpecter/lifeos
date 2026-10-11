import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeAll(() => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "lifeos-test-"));
  process.env.INGEST_TOKEN = "test-token-123";
});

const post = async (body: unknown, token?: string) => {
  const { POST } = await import("@/app/api/ingest/health/route");
  return POST(
    new Request("http://localhost/api/ingest/health", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
};

describe("POST /api/ingest/health", () => {
  it("lehnt fehlendes oder falsches Token ab", async () => {
    expect((await post({ steps: 1 })).status).toBe(401);
    expect((await post({ steps: 1 }, "falsch")).status).toBe(401);
  });

  it("speichert Werte vom Kurzbefehl", async () => {
    const res = await post({ date: "2026-10-11", steps: "8.432", sleep: "7,5" }, "test-token-123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, day: "2026-10-11", saved: 2 });

    const { db } = await import("@/lib/db");
    const { healthSeries } = await import("@/lib/health");
    expect(healthSeries(db(), ["2026-10-11"]).steps).toEqual([8432]);
  });

  it("meldet ungültige Eingaben", async () => {
    expect((await post("kein json", "test-token-123")).status).toBe(400);
    expect((await post({ foo: 1 }, "test-token-123")).status).toBe(400);
    expect((await post({ sleep: 99 }, "test-token-123")).status).toBe(400);
  });
});
