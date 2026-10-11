import { z } from "zod";

/**
 * Minimaler MCP-Server (Streamable HTTP, zustandslos, nur JSON-Antworten) – reicht für lesende Tools
 * und kommt ohne die Express/Hono-Abhängigkeiten des offiziellen SDK aus.
 * Spezifikation: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

export type McpTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  run(args: z.infer<S>): Promise<unknown>;
};

export const defineTool = <S extends z.ZodObject>(tool: McpTool<S>) => tool as unknown as McpTool;

export type McpServerInfo = { name: string; version: string; instructions?: string };

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const fail = (id: JsonRpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });
const text = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }],
  ...(isError ? { isError: true } : {}),
});

export async function dispatch(msg: JsonRpcRequest, info: McpServerInfo, tools: McpTool[]) {
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version },
        ...(info.instructions ? { instructions: info.instructions } : {}),
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.input, { io: "input" }),
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(msg.id, -32602, `Unbekanntes Tool: ${String(msg.params?.name)}`);
      const args = tool.input.safeParse(msg.params?.arguments ?? {});
      if (!args.success) return ok(msg.id, text(`Ungültige Argumente: ${args.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true));
      try {
        return ok(msg.id, text(await tool.run(args.data)));
      } catch (err) {
        return ok(msg.id, text(err instanceof Error ? err.message : "Unbekannter Fehler", true));
      }
    }
    default:
      return fail(msg.id, -32601, `Methode nicht unterstützt: ${msg.method}`);
  }
}

export async function handleMcpRequest(request: Request, info: McpServerInfo, tools: McpTool[]): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail(null, -32700, "Ungültiges JSON"), { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcRequest[];
  if (!messages.length || messages.some((m) => !m || m.jsonrpc !== "2.0" || typeof m.method !== "string")) {
    return Response.json(fail(null, -32600, "Ungültige Anfrage"), { status: 400 });
  }
  // Benachrichtigungen (ohne id) bekommen keine Antwort
  const requests = messages.filter((m) => m.id !== undefined && m.id !== null);
  if (!requests.length) return new Response(null, { status: 202 });
  const results = await Promise.all(requests.map((m) => dispatch(m, info, tools)));
  return Response.json(batch ? results : results[0]);
}
