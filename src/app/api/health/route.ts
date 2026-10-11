import { connection } from "next/server";
import { db } from "@/lib/db";

/** Healthcheck für Docker/Monitoring – prüft, ob die Datenbank antwortet. */
export async function GET() {
  await connection();
  try {
    db().prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
