import { handleMcpRequest } from "@/lib/mcp/server";
import { UNTIS_SERVER_INFO, untisTools } from "@/lib/mcp/untis-tools";

/**
 * Untis als MCP-Server für Claude & Co.: `claude mcp add --transport http untis https://<host>/api/mcp`.
 * Nur im Tailnet erreichbar (proxy.ts prüft den Tailscale-Header wie für das Dashboard), nur lesende Tools.
 */
export async function POST(request: Request) {
  return handleMcpRequest(request, UNTIS_SERVER_INFO, untisTools);
}

// zustandslos: kein SSE-Stream, keine Sitzungen
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
