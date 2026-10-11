import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Vollständiger Lauf gegen simulierte Gmail- und OpenAI-APIs: welche Aufrufe passieren wirklich? */

const calls: { method: string; url: string; body?: unknown }[] = [];

const MAILS: Record<string, { from: string; subject: string; labels: string[] }> = {
  ad: { from: "Shop <deals@shop.de>", subject: "Nur heute -30 %", labels: ["INBOX", "CATEGORY_PROMOTIONS"] },
  gh: { from: "GitHub <noreply@github.com>", subject: "CI passed", labels: ["INBOX", "CATEGORY_UPDATES"] },
  school: { from: "Schule <info@schule.de>", subject: "Elternbrief", labels: ["INBOX"] },
  unsure: { from: "Discord <noreply@discord.com>", subject: "12 neue Nachrichten", labels: ["INBOX"] },
  sec: { from: "Google <no-reply@accounts.google.com>", subject: "Sicherheitswarnung: neue Anmeldung", labels: ["INBOX"] },
};

const AI = {
  results: [
    { i: 0, category: "werbung", action: "trash", confidence: 0.96, reason: "Rabatt" },
    { i: 1, category: "benachrichtigung", action: "archive", confidence: 0.9, reason: "CI" },
    { i: 2, category: "schule", action: "trash", confidence: 0.99, reason: "falsch" },
    { i: 3, category: "social", action: "trash", confidence: 0.6, reason: "unsicher" },
  ],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "lifeos-mail-"));
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.OPENAI_API_KEY = "sk-test";

  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url.includes("api.openai.com")) {
      return json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(AI) }] }], usage: { input_tokens: 1000, output_tokens: 200 } });
    }
    if (url.includes("/messages?")) return json({ messages: Object.keys(MAILS).map((id) => ({ id })) });
    const meta = url.match(/\/messages\/(\w+)\?format=metadata/);
    if (meta) {
      const m = MAILS[meta[1]];
      return json({
        id: meta[1],
        threadId: meta[1],
        snippet: "…",
        internalDate: String(Date.now()),
        labelIds: m.labels,
        payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] },
      });
    }
    if (url.endsWith("/labels") && method === "GET") return json({ labels: [] });
    if (url.endsWith("/labels") && method === "POST") return json({ id: `L_${body.name}` });
    if (url.includes("batchModify") || url.endsWith("/trash") || url.endsWith("/untrash")) return new Response(null, { status: 204 });
    throw new Error(`unerwarteter Aufruf ${method} ${url}`);
  });

  const { saveToken } = await import("@/lib/tokens");
  saveToken("google:luis@example.com", {
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: Date.now() + 3600_000,
    scope: "https://www.googleapis.com/auth/gmail.modify",
  });
});

describe("runTriage", () => {
  it("führt nur sichere Aktionen aus und fragt bei Unsicherem nach", async () => {
    const { runTriage } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    const summary = await runTriage(db(), "manuell");

    expect(summary).toMatchObject({ scanned: 5, trashed: 1, archived: 1, kept: 2, pending: 1 });

    const trashed = calls.filter((c) => c.url.endsWith("/trash")).map((c) => c.url.split("/").at(-2));
    expect(trashed).toEqual(["ad"]);

    const archived = calls.filter((c) => c.url.includes("batchModify") && (c.body as { removeLabelIds: string[] }).removeLabelIds.includes("INBOX"));
    expect(archived.map((c) => (c.body as { ids: string[] }).ids[0])).toEqual(["gh"]);

    // Schule wurde trotz KI-Vorschlag "trash" behalten, Discord (unsicher) nicht angefasst
    const touched = new Set(calls.filter((c) => c.method === "POST" && c.url.includes("/messages/")).flatMap((c) => (c.body as { ids?: string[] })?.ids ?? [c.url.split("/").at(-2)]));
    expect(touched.has("unsure")).toBe(false);
    expect(calls.some((c) => c.url.includes("/school/trash"))).toBe(false);

    // Die KI hat nur Metadaten bekommen und die Sicherheitsmail gar nicht gesehen
    const aiCall = calls.find((c) => c.url.includes("openai"));
    const sent = JSON.parse((aiCall!.body as { input: string }).input);
    expect(sent).toHaveLength(4);
    expect(JSON.stringify(sent)).not.toContain("Sicherheitswarnung");

    const rows = db().prepare("SELECT id, status, action FROM mail_items ORDER BY id").all();
    expect(rows).toEqual([
      { id: "ad", status: "done", action: "trash" },
      { id: "gh", status: "done", action: "archive" },
      { id: "school", status: "done", action: "keep" },
      { id: "sec", status: "done", action: "keep" },
      { id: "unsure", status: "pending", action: "trash" },
    ]);
  });

  it("bearbeitet bereits gesehene Mails nicht erneut", async () => {
    const { runTriage } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    const before = calls.length;
    const summary = await runTriage(db(), "manuell");
    expect(summary.scanned).toBe(0);
    expect(calls.slice(before).some((c) => c.url.includes("openai") || c.url.includes("/trash"))).toBe(false);
  });

  it("Rückgängig holt die Mail zurück und merkt sich den Absender", async () => {
    const { undoMail, loadRules } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    await undoMail(db(), "luis@example.com", "ad");
    expect(calls.some((c) => c.url.endsWith("/ad/untrash"))).toBe(true);
    expect(loadRules(db())).toContainEqual({ matchType: "sender", pattern: "deals@shop.de", action: "keep", category: "werbung" });
  });

  it("Entscheidung im Widget wird ausgeführt und gelernt", async () => {
    const { decideMail, loadRules } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    await decideMail(db(), "luis@example.com", "unsure", "archive");
    expect(db().prepare("SELECT status, source FROM mail_items WHERE id = 'unsure'").get()).toEqual({ status: "done", source: "nutzer" });
    expect(loadRules(db()).find((r) => r.pattern === "noreply@discord.com")?.action).toBe("archive");
  });

  it("verbucht die KI-Kosten", async () => {
    const { monthSpendUsd } = await import("@/lib/openai");
    const { db } = await import("@/lib/db");
    expect(monthSpendUsd(db())).toBeCloseTo((1000 * 0.1 + 200 * 0.5) / 1e6);
  });
});
