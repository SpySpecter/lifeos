"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invalidate } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { addHabit, archiveHabit, deleteHabit, restoreHabit, toggleHabit } from "@/lib/habits";
import { METRIC_KEYS, parseLooseNumber, upsertHealth, type HealthValues } from "@/lib/health";
import { today } from "@/lib/time";
import { deleteToken } from "@/lib/tokens";
import { isDemo } from "@/lib/env";
import { clearInbox, decideMail, runTriage, undoMail, upsertRule } from "@/lib/mail/triage";
import { CATEGORIES } from "@/lib/mail/policy";
import { getSettings, setSetting } from "@/lib/settings";

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

export async function restoreHabitAction(habitId: number) {
  restoreHabit(db(), id.parse(habitId));
  revalidatePath("/", "layout");
}

export async function deleteHabitAction(habitId: number) {
  deleteHabit(db(), id.parse(habitId));
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

/** "spotify" oder "google:<e-mail>" */
export async function disconnectAction(provider: string) {
  z.string().regex(/^(spotify|google:[^\s@]+@[^\s@]+)$/).parse(provider);
  deleteToken(provider);
  revalidatePath("/", "layout");
}

/** Cache einer Integration leeren und neu laden (Aktualisieren-Knopf). */
export async function refreshAction(integrationId: string) {
  invalidate(db(), `${z.enum(["weather", "news", "github", "untis", "google", "spotify"]).parse(integrationId)}:`);
  revalidatePath("/", "layout");
}

// ─── Mail-Assistent ────────────────────────────────────────────────────

const mailRef = z.object({ account: z.string().email(), id: z.string().regex(/^[A-Za-z0-9]+$/) });
const mailAction = z.enum(["keep", "archive", "trash"]);

export async function runMailTriageAction(): Promise<FormState> {
  if (isDemo()) return { ok: false, message: "Im Demo-Modus deaktiviert" };
  try {
    const s = await runTriage(db(), "manuell");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `${s.scanned} neue Mails: ${s.archived} archiviert, ${s.trashed} gelöscht, ${s.pending} zum Entscheiden${s.notes.length ? ` · ${s.notes[0]}` : ""}`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function clearInboxAction(): Promise<FormState> {
  if (isDemo()) return { ok: false, message: "Im Demo-Modus deaktiviert" };
  try {
    const r = await clearInbox(db());
    revalidatePath("/", "layout");
    const total = r.accounts.reduce((n, a) => n + a.archived, 0);
    return { ok: true, message: `${total} Mails archiviert${r.notes.length ? ` · ${r.notes[0]}` : ""}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function decideMailAction(account: string, id: string, action: string) {
  if (isDemo()) return;
  const ref = mailRef.parse({ account, id });
  await decideMail(db(), ref.account, ref.id, mailAction.parse(action));
  revalidatePath("/", "layout");
}

export async function undoMailAction(account: string, id: string) {
  if (isDemo()) return;
  const ref = mailRef.parse({ account, id });
  await undoMail(db(), ref.account, ref.id);
  revalidatePath("/", "layout");
}

export async function deleteMailRuleAction(ruleId: number) {
  db().prepare("DELETE FROM mail_rules WHERE id = ?").run(id.parse(ruleId));
  revalidatePath("/settings");
}

const ruleSchema = z.object({
  pattern: z.string().trim().toLowerCase().min(3, "Absender oder Domain fehlt").max(120),
  action: mailAction,
  category: z.enum(CATEGORIES).nullable(),
});

export async function addMailRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse({
    pattern: formData.get("pattern"),
    action: formData.get("action"),
    category: formData.get("category") || null,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { pattern, action, category } = parsed.data;
  upsertRule(db(), { matchType: pattern.includes("@") ? "sender" : "domain", pattern: pattern.replace(/^@/, ""), action, category }, "nutzer");
  revalidatePath("/settings");
  return { ok: true, message: "Regel gespeichert" };
}

// ─── Persönliche Einstellungen ─────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().trim().max(40),
  placeName: z.string().trim().max(60),
  lat: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]),
  lon: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]),
  steps: z.coerce.number().int().min(1000).max(50_000),
  sleep: z.coerce.number().min(4).max(12),
  workout: z.coerce.number().int().min(5).max(300),
  energy: z.coerce.number().int().min(50).max(3000),
});

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(
    ["displayName", "placeName", "lat", "lon", "steps", "sleep", "workout", "energy"].map((k) => [
      k,
      String(formData.get(k) ?? "").replace(",", "."),
    ]),
  );
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: `Ungültig: ${parsed.error.issues[0].path.join(".")}` };
  const p = parsed.data;
  setSetting(db(), "displayName", p.displayName);
  setSetting(
    db(),
    "defaultPlace",
    p.lat === "" || p.lon === "" ? null : { name: p.placeName || "Standard", lat: p.lat, lon: p.lon },
  );
  setSetting(db(), "goals", { steps: p.steps, sleep: p.sleep, workout: p.workout, energy: p.energy });
  revalidatePath("/", "layout");
  return { ok: true, message: "Gespeichert" };
}

export async function saveMailProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = z.string().trim().min(20, "Bitte etwas ausführlicher").max(4000).safeParse(formData.get("mailProfile"));
  if (!text.success) return { ok: false, message: text.error.issues[0].message };
  setSetting(db(), "mailProfile", text.data);
  revalidatePath("/settings");
  return { ok: true, message: `Gespeichert (${getSettings(db()).mailProfile.length} Zeichen)` };
}
