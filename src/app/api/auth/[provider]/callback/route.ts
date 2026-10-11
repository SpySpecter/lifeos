import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { invalidate } from "@/lib/cache";
import { db } from "@/lib/db";
import { consumeOAuthState, saveToken } from "@/lib/tokens";
import { exchangeGoogleCode, googleEmail, googleKey } from "@/integrations/google";
import { exchangeSpotifyCode } from "@/integrations/spotify";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "spotify") return new Response("Unbekannter Anbieter", { status: 404 });

  const params = request.nextUrl.searchParams;
  const state = consumeOAuthState(provider, params.get("state"));
  const code = params.get("code");
  if (!state || !code) redirect(`/settings?error=${provider}-denied`);

  let ok = false;
  try {
    const res =
      provider === "google" ? await exchangeGoogleCode(code) : await exchangeSpotifyCode(code, state.verifier ?? "");
    if (!res.refresh_token) throw new Error("Kein Refresh-Token erhalten");
    // Google: ein Eintrag pro Konto, damit mehrere Konten parallel verbunden sein können
    const key = provider === "google" ? googleKey(await googleEmail(res.access_token)) : "spotify";
    saveToken(key, {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: Date.now() + res.expires_in * 1000,
      scope: res.scope,
    });
    invalidate(db(), `${provider}:`);
    ok = true;
  } catch (err) {
    console.error(`[oauth:${provider}]`, err);
  }
  redirect(ok ? `/settings?connected=${provider}` : `/settings?error=${provider}-exchange`);
}
