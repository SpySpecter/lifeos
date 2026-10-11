import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** Untis-MCP im Demo-Modus: Protokoll-Handshake, Tool-Liste und Fehlerfälle. */

beforeAll(() => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "lifeos-mcp-"));
  process.env.DEMO_MODE = "true";
});

async function rpc(body: unknown) {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(new Request("http://localhost/api/mcp", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
  return { status: res.status, json: res.status === 202 ? null : await res.json() };
}

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const { json } = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
  return json.result as { content: { type: string; text: string }[]; isError?: boolean };
};

describe("Untis-MCP", () => {
  it("handshake nennt Protokollversion und Tools-Fähigkeit", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(json.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "lifeos-untis" } });
    expect(json.result.instructions).toContain("nicht den Google-Kalender");
    expect(json.result.instructions).toContain("📝 Klausur");
  });

  it("Benachrichtigungen werden mit 202 quittiert", async () => {
    expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  });

  it("listet nur lesende Tools mit JSON-Schema", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = json.result.tools as { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual(["get_today", "get_timetable", "get_changes", "get_exams", "get_homework"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });

  it("liefert den heutigen Plan mit Klartext-Fach und Status", async () => {
    const res = await call("get_today");
    const data = JSON.parse(res.content[0].text);
    expect(data.lessons.length).toBeGreaterThan(0);
    expect(data.lessons.some((l: { status: string }) => l.status === "entfällt")).toBe(true);
  });

  it("Änderungen enthalten nur Ausfälle/Vertretungen", async () => {
    const data = JSON.parse((await call("get_changes", { days: 7 })).content[0].text) as { status: string }[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((l) => l.status !== "regulär")).toBe(true);
  });

  it("zu großer Zeitraum und falsches Format sind Tool-Fehler", async () => {
    const big = await call("get_timetable", { date_from: "2026-10-01", date_to: "2026-12-31" });
    expect(big.isError).toBe(true);
    expect(big.content[0].text).toContain("höchstens 31");
    const bad = await call("get_timetable", { date_from: "morgen" });
    expect(bad.isError).toBe(true);
  });

  it("unbekannte Methoden und Tools ergeben JSON-RPC-Fehler", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 9, method: "resources/list" })).json.error.code).toBe(-32601);
    expect((await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "drop_db" } })).json.error.code).toBe(-32602);
    expect((await rpc({ nope: true })).status).toBe(400);
  });

  it("GET ist nicht erlaubt (kein SSE)", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    expect(GET().status).toBe(405);
  });
});
