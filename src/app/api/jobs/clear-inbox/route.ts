import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { clearInbox } from "@/lib/mail/triage";

/** Posteingang aller Konten leeren (archivieren, nie löschen): `Authorization: Bearer $CRON_TOKEN`. */
export async function POST(request: Request) {
  const expected = env().CRON_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || !auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), expected)) {
    return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  try {
    const result = await clearInbox(db());
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
