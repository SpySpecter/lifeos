import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ingestSchema, upsertHealth } from "@/lib/health";
import { today } from "@/lib/time";

/**
 * Empfängt Gesundheitswerte vom iPhone-Kurzbefehl (Apple Health → „Inhalte von URL abrufen“).
 * Authentifizierung per `Authorization: Bearer $INGEST_TOKEN`. Siehe docs/SETUP.md#iphone-kurzbefehl.
 */
export async function POST(request: Request) {
  const expected = env().INGEST_TOKEN;
  if (!expected) return Response.json({ error: "INGEST_TOKEN ist nicht gesetzt" }, { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, expected)) return Response.json({ error: "Nicht autorisiert" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body muss JSON sein" }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Felder", details: parsed.error.issues.map((i) => i.path.join(".") || i.message) }, { status: 400 });
  }

  const { date, ...values } = parsed.data;
  const day = date ?? today(env().APP_TZ);
  try {
    const saved = upsertHealth(db(), day, values, "shortcut");
    revalidatePath("/", "layout");
    return Response.json({ ok: true, day, saved });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fehler" }, { status: 400 });
  }
}
