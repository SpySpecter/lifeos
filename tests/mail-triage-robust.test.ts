import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Fehlerfälle der Mail-Sortierung: Teilausfälle dürfen weder den Lauf abbrechen noch Aktionen unprotokolliert lassen. */

const DAY = 86_400_000;
const MAILS: Record<string, { from: string; subject: string }> = {
  ad1: { from: "Shop <deals@shop.de>", subject: "Sale 1" },
  ad2: { from: "Shop <deals@shop.de>", subject: "Sale 2" },
  gone: { from: "Jemand <x@y.de>", subject: "Schon gelöscht" },
};
const calls: string[] = [];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "lifeos-mail-robust-"));
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  delete process.env.OPENAI_API_KEY;

  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.includes("/messages?")) return json({ messages: Object.keys(MAILS).map((id) => ({ id })) });
    const meta = url.match(/\/messages\/(\w+)\?format=metadata/);
    if (meta) {
      if (meta[1] === "gone") return json({ error: { code: 404, message: "Requested entity was not found." } }, 404);
      const m = MAILS[meta[1]];
      return json({
        id: meta[1],
        threadId: meta[1],
        snippet: "…",
        internalDate: String(Date.now()),
        labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
        payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] },
      });
    }
    if (url.endsWith("/labels") && method === "GET") return json({ labels: [] });
    if (url.endsWith("/labels") && method === "POST") return json({ id: `L_${JSON.parse(String(init!.body)).name}` });
    if (url.endsWith("/ad2/trash")) return json({ error: { code: 500, message: "Backend Error" } }, 500);
    if (url.includes("batchModify") || url.endsWith("/trash")) return new Response(null, { status: 204 });
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

describe("runTriage bei Teilausfällen", () => {
  it("bricht bei einer nicht lesbaren Mail nicht ab und protokolliert schon Gelöschtes", async () => {
    const { runTriage, upsertRule } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    upsertRule(db(), { matchType: "sender", pattern: "deals@shop.de", action: "trash", category: "werbung" }, "nutzer");

    const summary = await runTriage(db(), "manuell");

    expect(summary.scanned).toBe(2);
    expect(summary.trashed).toBe(1);
    expect(summary.notes).toEqual([
      "OPENAI_API_KEY fehlt – nur Regeln aktiv",
      "luis@example.com: 1 Mail nicht lesbar – beim nächsten Lauf erneut",
      expect.stringMatching(/^1× trash\/werbung nicht ausgeführt: Gmail 500/),
    ]);
    // ad1 liegt im Papierkorb und ist protokolliert (also rückgängig zu machen); ad2 und gone kommen beim nächsten Lauf wieder
    expect(db().prepare("SELECT id, action FROM mail_items ORDER BY id").all()).toEqual([{ id: "ad1", action: "trash" }]);
  });

  it("archiviert ausdrücklich behaltene Rechnungen nicht automatisch", async () => {
    const { runTriage } = await import("@/lib/mail/triage");
    const { db } = await import("@/lib/db");
    const insert = db().prepare(
      `INSERT INTO mail_items (account, id, from_name, from_email, subject, snippet, date, category, action, status, source, processed_at)
       VALUES ('luis@example.com', ?, 'Shop', 'rechnung@shop.de', 'Ihre Rechnung', '', ?, 'finanzen', 'keep', 'done', ?, ?)`,
    );
    const old = Date.now() - 30 * DAY;
    insert.run("bill-nutzer", old, "nutzer", old);
    insert.run("bill-regel", old, "regel", old);
    // die fehlgeschlagenen Mails vom ersten Lauf nicht noch einmal anfassen
    for (const id of ["ad2", "gone"]) insert.run(id, Date.now(), "regel", Date.now());

    const before = calls.length;
    await runTriage(db(), "manuell");

    const archived = calls.slice(before).filter((c) => c.includes("batchModify"));
    expect(archived).toHaveLength(1);
    expect(db().prepare("SELECT id, action FROM mail_items WHERE id LIKE 'bill-%' ORDER BY id").all()).toEqual([
      { id: "bill-nutzer", action: "keep" },
      { id: "bill-regel", action: "archive" },
    ]);
  });
});
