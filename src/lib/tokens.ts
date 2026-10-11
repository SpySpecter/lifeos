import "server-only";
import { decrypt, encrypt, randomToken } from "./crypto";
import { db } from "./db";

export type Provider = "google" | "spotify";

export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms
  scope?: string;
};

export function getToken(provider: Provider): StoredToken | null {
  const row = db().prepare("SELECT data FROM tokens WHERE provider = ?").get(provider) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.data)) as StoredToken;
  } catch {
    return null; // Schlüssel gewechselt → neu verbinden
  }
}

export function saveToken(provider: Provider, token: StoredToken): void {
  db()
    .prepare(
      "INSERT INTO tokens (provider, data, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(provider) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    )
    .run(provider, encrypt(JSON.stringify(token)), Date.now());
}

export function deleteToken(provider: Provider): void {
  db().prepare("DELETE FROM tokens WHERE provider = ?").run(provider);
  db().prepare("DELETE FROM cache WHERE key LIKE ?").run(`${provider}:%`);
}

const STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState(provider: Provider, verifier: string | null = null): string {
  const state = randomToken(24);
  const now = Date.now();
  db().prepare("DELETE FROM oauth_state WHERE created_at < ?").run(now - STATE_TTL_MS);
  db()
    .prepare("INSERT INTO oauth_state (state, provider, verifier, created_at) VALUES (?, ?, ?, ?)")
    .run(state, provider, verifier, now);
  return state;
}

/** Einmal verwendbar; liefert den PKCE-Verifier (falls vorhanden) oder `undefined` bei ungültigem State. */
export function consumeOAuthState(provider: Provider, state: string | null): { verifier: string | null } | undefined {
  if (!state) return undefined;
  const row = db()
    .prepare("SELECT verifier, created_at FROM oauth_state WHERE state = ? AND provider = ?")
    .get(state, provider) as { verifier: string | null; created_at: number } | undefined;
  db().prepare("DELETE FROM oauth_state WHERE state = ?").run(state);
  if (!row || Date.now() - row.created_at > STATE_TTL_MS) return undefined;
  return { verifier: row.verifier };
}

/**
 * Gemeinsamer Refresh-Ablauf für OAuth-Anbieter. Gibt ein gültiges Access-Token zurück oder wirft,
 * wenn der Nutzer neu verbinden muss.
 */
export async function validAccessToken(
  provider: Provider,
  refresh: (refreshToken: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string }>,
): Promise<string> {
  const token = getToken(provider);
  if (!token) throw new Error("Nicht verbunden");
  if (token.expiresAt - 60_000 > Date.now()) return token.accessToken;
  let fresh: Awaited<ReturnType<typeof refresh>>;
  try {
    fresh = await refresh(token.refreshToken);
  } catch (err) {
    if (err instanceof Error && /invalid_grant/i.test(err.message)) {
      deleteToken(provider);
      throw new Error("Verbindung abgelaufen – bitte in den Einstellungen neu verbinden");
    }
    throw err;
  }
  const next: StoredToken = {
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + fresh.expires_in * 1000,
    scope: fresh.scope ?? token.scope,
  };
  saveToken(provider, next);
  return next.accessToken;
}

export async function postForm<T>(url: string, body: Record<string, string>, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(`${new URL(url).host}: ${[json.error, json.error_description].filter(Boolean).join(" – ") || res.status}`);
  }
  return json;
}
