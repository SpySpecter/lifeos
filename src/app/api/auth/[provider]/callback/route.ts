import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { consumeOAuthState, saveToken, type Provider } from "@/lib/tokens";
import { exchangeGoogleCode } from "@/integrations/google";
import { exchangeSpotifyCode } from "@/integrations/spotify";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "spotify") return new Response("Unbekannter Anbieter", { status: 404 });

  const params = request.nextUrl.searchParams;
  const state = consumeOAuthState(provider as Provider, params.get("state"));
  const code = params.get("code");
  if (!state || !code) redirect(`/settings?error=${provider}-denied`);

  let ok = false;
  try {
    const res =
      provider === "google" ? await exchangeGoogleCode(code) : await exchangeSpotifyCode(code, state.verifier ?? "");
    if (!res.refresh_token) throw new Error("Kein Refresh-Token erhalten");
    saveToken(provider, {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: Date.now() + res.expires_in * 1000,
      scope: res.scope,
    });
    ok = true;
  } catch (err) {
    console.error(`[oauth:${provider}]`, err);
  }
  redirect(ok ? `/settings?connected=${provider}` : `/settings?error=${provider}-exchange`);
}
