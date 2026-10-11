"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invalidate } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { addHabit, archiveHabit, toggleHabit } from "@/lib/habits";
import { METRIC_KEYS, parseLooseNumber, upsertHealth, type HealthValues } from "@/lib/health";
import { today } from "@/lib/time";
import { deleteToken } from "@/lib/tokens";

const id = z.number().int().positive();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function toggleHabitAction(habitId: number, forDay?: string) {
  toggleHabit(db(), id.parse(habitId), day.parse(forDay ?? today(env().APP_TZ)));
  revalidatePath("/", "layout");
}

export type FormState = { ok: boolean; message: string } | null;

const habitSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60, "Maximal 60 Zeichen"),
  emoji: z.string().trim().max(8).default("✅"),
});

export async function addHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = habitSchema.safeParse({ name: formData.get("name"), emoji: formData.get("emoji") || "✅" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  addHabit(db(), parsed.data.name, parsed.data.emoji || "✅");
  revalidatePath("/", "layout");
  return { ok: true, message: `„${parsed.data.name}“ angelegt` };
}

export async function archiveHabitAction(habitId: number) {
  archiveHabit(db(), id.parse(habitId));
  revalidatePath("/", "layout");
}

export async function saveHealthAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const d = day.safeParse(formData.get("day"));
  if (!d.success) return { ok: false, message: "Ungültiges Datum" };
  const values: HealthValues = {};
  for (const key of METRIC_KEYS) {
    const v = parseLooseNumber(formData.get(key));
    if (v !== undefined) values[key] = v;
  }
  if (!Object.keys(values).length) return { ok: false, message: "Bitte mindestens einen Wert eintragen" };
  try {
    const n = upsertHealth(db(), d.data, values, "manual");
    revalidatePath("/", "layout");
    return { ok: true, message: `${n} Wert${n === 1 ? "" : "e"} gespeichert` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Fehler beim Speichern" };
  }
}

export async function disconnectAction(provider: "google" | "spotify") {
  z.enum(["google", "spotify"]).parse(provider);
  deleteToken(provider);
  revalidatePath("/", "layout");
}

/** Cache einer Integration leeren und neu laden (Aktualisieren-Knopf). */
export async function refreshAction(integrationId: string) {
  invalidate(db(), `${z.enum(["weather", "news", "github", "untis", "google", "spotify"]).parse(integrationId)}:`);
  revalidatePath("/", "layout");
}
