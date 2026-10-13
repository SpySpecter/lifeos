import { revalidatePath } from "next/cache";
import { handleMcpRequest, type McpTool } from "@/lib/mcp/server";
import { LIFEOS_SERVER_INFO, lifeosTools } from "@/lib/mcp/lifeos-tools";

/**
 * LifeOS als MCP-Server (lesen und eintragen): `claude mcp add --transport http lifeos https://<host>/api/mcp/lifeos`.
 * Nur im Tailnet erreichbar (proxy.ts). Nach schreibenden Tools wird das Dashboard neu gerendert.
 */
const tools: McpTool[] = lifeosTools.map((t) =>
  t.annotations?.readOnlyHint === false
    ? {
        ...t,
        async run(args) {
          const result = await t.run(args);
          revalidatePath("/", "layout");
          return result;
        },
      }
    : t,
);

export async function POST(request: Request) {
  return handleMcpRequest(request, LIFEOS_SERVER_INFO, tools);
}

// zustandslos: kein SSE-Stream, keine Sitzungen
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
