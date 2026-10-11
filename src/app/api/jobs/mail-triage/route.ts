import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runTriage } from "@/lib/mail/triage";

/** Wird vom systemd-Timer (06:00 und 16:00) aufgerufen: `Authorization: Bearer $CRON_TOKEN`. */
export async function POST(request: Request) {
  const expected = env().CRON_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || !auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), expected)) {
    return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  try {
    const summary = await runTriage(db(), "timer");
    revalidatePath("/", "layout");
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
