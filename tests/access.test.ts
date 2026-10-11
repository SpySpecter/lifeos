import { describe, expect, it } from "vitest";
import { accessConfigFromEnv, checkAccess } from "@/lib/access";

const strict = { demo: false, requireTailscale: true, allowedUsers: ["spyspecter@github"] };

describe("checkAccess", () => {
  it("lehnt Anfragen ohne Tailscale-Identität ab", () => {
    expect(checkAccess("/", null, strict)).toMatchObject({ allowed: false, status: 401 });
  });
  it("lehnt fremde Tailnet-Nutzer ab (Groß/Klein egal)", () => {
    expect(checkAccess("/", "someone@github", strict)).toMatchObject({ allowed: false, status: 403 });
    expect(checkAccess("/", "SpySpecter@github", strict)).toMatchObject({ allowed: true });
  });
  it("lässt Ingest und Healthcheck durch (eigene Authentifizierung)", () => {
    expect(checkAccess("/api/ingest/health", null, strict).allowed).toBe(true);
    expect(checkAccess("/api/health", null, strict).allowed).toBe(true);
    expect(checkAccess("/api/healthz", null, strict).allowed).toBe(false);
  });
  it("erlaubt jeden Tailnet-Nutzer bei leerer Allowlist", () => {
    expect(checkAccess("/", "x@github", { ...strict, allowedUsers: [] }).allowed).toBe(true);
  });
  it("ist im Demo-Modus offen", () => {
    expect(checkAccess("/", null, { ...strict, demo: true }).allowed).toBe(true);
  });
  it("liest die Konfiguration aus der Umgebung", () => {
    expect(accessConfigFromEnv({ REQUIRE_TAILSCALE_AUTH: "true", ALLOWED_TAILSCALE_USERS: " A@x , b@y " } as unknown as NodeJS.ProcessEnv)).toEqual({
      demo: false,
      requireTailscale: true,
      allowedUsers: ["a@x", "b@y"],
    });
  });
});
