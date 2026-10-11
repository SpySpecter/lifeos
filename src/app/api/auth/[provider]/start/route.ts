import { redirect } from "next/navigation";
import { pkceChallenge, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { createOAuthState } from "@/lib/tokens";
import { googleAuthUrl } from "@/integrations/google";
import { spotifyAuthUrl } from "@/integrations/spotify";

export async function GET(_request: Request, ctx: RouteContext<"/api/auth/[provider]/start">) {
  const { provider } = await ctx.params;
  const e = env();
  if (e.DEMO_MODE) redirect("/settings?error=demo");

  if (provider === "google") {
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) redirect("/settings?error=google-config");
    redirect(googleAuthUrl(createOAuthState("google")));
  }
  if (provider === "spotify") {
    if (!e.SPOTIFY_CLIENT_ID) redirect("/settings?error=spotify-config");
    const verifier = randomToken(48);
    redirect(spotifyAuthUrl(createOAuthState("spotify", verifier), pkceChallenge(verifier)));
  }
  return new Response("Unbekannter Anbieter", { status: 404 });
}
