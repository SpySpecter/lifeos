import "server-only";
import { connection } from "next/server";
import { cached } from "@/lib/cache";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/env";

export type WidgetResult<T> =
  | { status: "ok"; data: T; fetchedAt: number; stale: boolean }
  | { status: "unconfigured"; hint: string; connectHref?: string }
  | { status: "error"; message: string };

/**
 * Eine externe Datenquelle. Jede Integration liefert echte Daten (`fetch`) und Demo-Daten (`mock`),
 * damit das Dashboard ohne Zugangsdaten vollständig vorführbar ist.
 */
export interface Integration<T, A = void> {
  id: string;
  ttlSeconds: number;
  /** `null` wenn einsatzbereit, sonst ein Hinweis, was noch fehlt. */
  missingConfig(): { hint: string; connectHref?: string } | null;
  cacheKey?(args: A): string;
  fetch(args: A): Promise<T>;
  mock(args: A): T;
}

export async function load<T, A = void>(integration: Integration<T, A>, args: A): Promise<WidgetResult<T>> {
  await connection(); // nie zur Build-Zeit vorrendern – alles hier ist Laufzeitdaten
  return resolve(integration, args);
}

/** Wie `load`, aber ohne Request-Kontext – auch aus dem Hintergrund-Loop (Morgenbriefing) aufrufbar. */
export async function resolve<T, A = void>(integration: Integration<T, A>, args: A): Promise<WidgetResult<T>> {
  if (isDemo()) {
    return { status: "ok", data: integration.mock(args), fetchedAt: Date.now(), stale: false };
  }

  const missing = integration.missingConfig();
  if (missing) return { status: "unconfigured", ...missing };

  const key = `${integration.id}:${integration.cacheKey?.(args) ?? "default"}`;
  try {
    const hit = await cached(db(), key, integration.ttlSeconds, () => integration.fetch(args));
    return { status: "ok", ...hit };
  } catch (err) {
    console.error(`[${integration.id}]`, err);
    return { status: "error", message: err instanceof Error ? err.message.slice(0, 200) : "Unbekannter Fehler" };
  }
}

export class IntegrationError extends Error {}

/** fetch mit Timeout und verständlicher Fehlermeldung. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) {
    throw new IntegrationError(`${new URL(url).host} antwortet mit ${res.status}`);
  }
  return (await res.json()) as T;
}
