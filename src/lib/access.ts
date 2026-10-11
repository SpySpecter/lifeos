/**
 * Zugriffsregel (ohne Next-Abhängigkeiten, damit testbar).
 *
 * Die App lauscht nur auf 127.0.0.1. Erreichbar ist sie ausschließlich über `tailscale serve`, das jeder Anfrage
 * eines Tailnet-Nutzers den Header `Tailscale-User-Login` mitgibt (vom Client gesendete Kopien entfernt Tailscale).
 * Fehlt der Header, kommt die Anfrage nicht über Tailscale – sie wird abgelehnt.
 */
export type AccessConfig = { demo: boolean; requireTailscale: boolean; allowedUsers: string[] };
export type AccessDecision = { allowed: true; user: string | null } | { allowed: false; status: 401 | 403; reason: string };

/** Pfade mit eigener Authentifizierung bzw. ohne sensible Daten. */
const PUBLIC_PATHS = [/^\/api\/health$/, /^\/api\/ingest\//, /^\/api\/jobs\//, /^\/manifest\.webmanifest$/, /^\/icon/, /^\/apple-icon/];

export function checkAccess(path: string, login: string | null, cfg: AccessConfig): AccessDecision {
  if (cfg.demo || !cfg.requireTailscale) return { allowed: true, user: login };
  if (PUBLIC_PATHS.some((re) => re.test(path))) return { allowed: true, user: login };
  if (!login) return { allowed: false, status: 401, reason: "Nur über Tailscale erreichbar." };
  if (cfg.allowedUsers.length && !cfg.allowedUsers.includes(login.toLowerCase())) {
    return { allowed: false, status: 403, reason: "Dieser Tailscale-Nutzer hat keinen Zugriff." };
  }
  return { allowed: true, user: login };
}

export function accessConfigFromEnv(e: NodeJS.ProcessEnv = process.env): AccessConfig {
  const flag = (v: string | undefined) => v === "true" || v === "1";
  return {
    demo: flag(e.DEMO_MODE),
    requireTailscale: flag(e.REQUIRE_TAILSCALE_AUTH),
    allowedUsers: (e.ALLOWED_TAILSCALE_USERS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

/**
 * CSRF-Schutz für schreibende Anfragen. Weil die Anmeldung über das Netzwerk (Tailscale) und nicht über Cookies läuft,
 * könnte sonst jede fremde Webseite, die ein Tailnet-Gerät öffnet, Aktionen auslösen.
 * Erlaubt sind nur Anfragen ohne Origin (z. B. iPhone-Kurzbefehl, curl) oder mit Origin = APP_URL bzw. eigenem Host.
 * `forwardedHost` wird gesetzt, damit Next.js' eigene Server-Action-Prüfung hinter `tailscale serve` denselben Host sieht.
 */
export function checkOrigin(
  method: string,
  origin: string | null,
  host: string | null,
  appUrl: string,
): { allowed: true; forwardedHost?: string } | { allowed: false } {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS" || !origin) return { allowed: true };
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { allowed: false };
  }
  const appHost = new URL(appUrl).host;
  if (originHost === appHost) return { allowed: true, forwardedHost: appHost };
  if (host && originHost === host) return { allowed: true };
  return { allowed: false };
}
