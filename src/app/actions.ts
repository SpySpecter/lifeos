"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { invalidate } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeLayout } from "@/lib/dashboard";
import { isSingleEmoji, suggestEmoji } from "@/lib/emoji";
import { addHabit, archiveHabit, deleteHabit, reorderHabits, restoreHabit, toggleHabit, updateHabit } from "@/lib/habits";
import { deleteSubscription, saveSubscription, sendToAll } from "@/lib/push";
import { METRIC_KEYS, parseLooseNumber, upsertHealth, type HealthValues } from "@/lib/health";
import { today } from "@/lib/time";
import { deleteToken } from "@/lib/tokens";
import { isDemo } from "@/lib/env";
import { clearInbox, decideMail, runTriage, undoMail, upsertRule } from "@/lib/mail/triage";
import { CATEGORIES } from "@/lib/mail/policy";
import { getSettings, setSetting } from "@/lib/settings";
import { getOrCreateBriefing } from "@/lib/briefing";
import { BudgetExceededError } from "@/lib/openai";
import {
  addMaterial,
  deleteFlashcardSet,
  deleteMaterial,
  deletePlan,
  generateFlashcards,
  generateStudyPlan,
  MAX_FILE_BYTES,
  prepareMaterial,
  saveFlashcardSet,
  savePlan,
  setPlanArchived,
  StudyError,
  toggleSession,
} from "@/lib/study";

const id = z.number().int().positive();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function toggleHabitAction(habitId: number, forDay?: string) {
  toggleHabit(db(), id.parse(habitId), day.parse(forDay ?? today(env().APP_TZ)));
  revalidatePath("/", "layout");
}

export type FormState = { ok: boolean; message: string } | null;

const habitSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60, "Maximal 60 Zeichen"),
  emoji: z
    .string()
    .trim()
    .refine((v) => v === "" || isSingleEmoji(v), "Bitte genau ein Emoji wählen"),
  remindAt: z
    .string()
    .trim()
    .regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "Uhrzeit im Format HH:MM"),
});

function parseHabitForm(
  formData: FormData,
): { error: string } | { habit: { name: string; emoji: string; remindAt: string | null } } {
  const parsed = habitSchema.safeParse({
    name: formData.get("name") ?? "",
    emoji: formData.get("emoji") ?? "",
    remindAt: formData.get("remindAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" };
  const { name, emoji, remindAt } = parsed.data;
  return { habit: { name, emoji: emoji || suggestEmoji(name) || "✅", remindAt: remindAt || null } };
}

export async function addHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = parseHabitForm(formData);
  if ("error" in p) return { ok: false, message: p.error };
  addHabit(db(), p.habit.name, p.habit.emoji, p.habit.remindAt);
  revalidatePath("/", "layout");
  return { ok: true, message: `„${p.habit.name}“ angelegt${p.habit.remindAt ? ` · Erinnerung um ${p.habit.remindAt}` : ""}` };
}

export async function updateHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const habitId = id.safeParse(Number(formData.get("id")));
  const p = parseHabitForm(formData);
  if (!habitId.success) return { ok: false, message: "Ungültige Gewohnheit" };
  if ("error" in p) return { ok: false, message: p.error };
  updateHabit(db(), habitId.data, p.habit);
  revalidatePath("/", "layout");
  return { ok: true, message: "Gespeichert" };
}

export async function reorderHabitsAction(ids: number[]) {
  reorderHabits(db(), z.array(id).max(200).parse(ids));
  revalidatePath("/", "layout");
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
  invalidate(db(), `${z.enum(["weather", "news", "github", "untis", "google", "spotify", "exams"]).parse(integrationId)}:`);
  revalidatePath("/", "layout");
}

/** Ziehen zum Aktualisieren: alle API-Caches leeren (Bilder-Cache der News bleibt). */
export async function refreshAllAction() {
  for (const id of ["weather", "news", "github", "untis", "google", "spotify", "exams"]) invalidate(db(), `${id}:`);
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

const briefingSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit im Format HH:MM"),
  weekends: z.boolean(),
});

export async function saveBriefingSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = briefingSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    time: String(formData.get("time") ?? ""),
    weekends: formData.get("weekends") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  setSetting(db(), "briefing", parsed.data);
  revalidatePath("/settings");
  const b = parsed.data;
  return { ok: true, message: b.enabled ? `Gespeichert – kommt ${b.weekends ? "täglich" : "Mo–Fr"} um ${b.time}` : "Gespeichert – Push aus" };
}

/** Briefing für heute neu bauen (fragt die KI erneut). */
export async function refreshBriefingAction(): Promise<void> {
  await getOrCreateBriefing(db(), new Date(), env().APP_TZ, { force: true });
  revalidatePath("/briefing");
}

export async function saveMailProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = z.string().trim().min(20, "Bitte etwas ausführlicher").max(4000).safeParse(formData.get("mailProfile"));
  if (!text.success) return { ok: false, message: text.error.issues[0].message };
  setSetting(db(), "mailProfile", text.data);
  revalidatePath("/settings");
  return { ok: true, message: `Gespeichert (${getSettings(db()).mailProfile.length} Zeichen)` };
}

const pushSubscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscriptionAction(sub: unknown, device: string): Promise<FormState> {
  if (isDemo()) return { ok: false, message: "Im Demo-Modus deaktiviert" };
  const parsed = pushSubscription.safeParse(sub);
  if (!parsed.success) return { ok: false, message: "Ungültiges Push-Abo" };
  try {
    saveSubscription(db(), parsed.data, device.slice(0, 80) || null);
    return { ok: true, message: "Mitteilungen aktiv" };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function deletePushSubscriptionAction(endpoint: string) {
  deleteSubscription(db(), z.string().max(1000).parse(endpoint));
}

export async function sendTestPushAction(): Promise<FormState> {
  if (isDemo()) return { ok: false, message: "Im Demo-Modus deaktiviert" };
  const r = await sendToAll(db(), { title: "🔔 LifeOS", body: "Mitteilungen funktionieren. So sehen deine Erinnerungen aus.", url: "/habits", tag: "test" });
  if (!r.sent) return { ok: false, message: r.errors[0] ? `Senden fehlgeschlagen: ${r.errors[0]}` : "Kein Gerät registriert" };
  return { ok: true, message: `An ${r.sent} ${r.sent === 1 ? "Gerät" : "Geräte"} gesendet` };
}

/** Aufbau der Heute-Seite speichern (Reihenfolge + groß/kompakt/aus). Unbekanntes wird verworfen. */
export async function saveDashboardAction(layout: unknown) {
  setSetting(db(), "dashboard", normalizeLayout(layout));
  revalidatePath("/", "layout");
}

// ─── Lernen ────────────────────────────────────────────────────────────

const MATERIAL_EXT = /\.(md|markdown|txt)$/i;

/** Fehler der KI-Aufrufe in eine verständliche Meldung übersetzen. */
function studyFailure(err: unknown): FormState {
  if (err instanceof StudyError || err instanceof BudgetExceededError) return { ok: false, message: err.message };
  console.error("[lernen]", err);
  return { ok: false, message: "Die KI ist gerade nicht erreichbar – bitte später noch einmal versuchen." };
}

export async function uploadMaterialsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const subject = z.string().trim().max(60).safeParse(formData.get("subject") ?? "");
  if (!files.length) return { ok: false, message: "Bitte mindestens eine .md-Datei auswählen" };
  if (!subject.success) return { ok: false, message: "Fach: maximal 60 Zeichen" };
  const added: string[] = [];
  const skipped: string[] = [];
  for (const f of files.slice(0, 20)) {
    if (!MATERIAL_EXT.test(f.name)) skipped.push(`${f.name} (kein Markdown)`);
    else if (f.size > MAX_FILE_BYTES) skipped.push(`${f.name} (über 2 MB)`);
    else {
      const content = prepareMaterial(await f.text());
      if (!content) skipped.push(`${f.name} (leer)`);
      else {
        // Titel aus der ersten Hauptüberschrift, sonst aus dem Dateinamen
        const heading = /^# +(.+)$/m.exec(content)?.[1].replace(/[*_`]/g, "").trim();
        const title = (heading || f.name.replace(MATERIAL_EXT, "").replace(/[_-]+/g, " ").trim()).slice(0, 120) || "Material";
        addMaterial(db(), { title, subject: subject.data || null, content });
        added.push(title);
      }
    }
  }
  revalidatePath("/lernen");
  const note = skipped.length ? ` · übersprungen: ${skipped.join(", ")}` : "";
  if (!added.length) return { ok: false, message: `Nichts hochgeladen${note}` };
  return { ok: true, message: `${added.length === 1 ? `„${added[0]}“` : `${added.length} Dateien`} hochgeladen${note}` };
}

export async function deleteMaterialAction(materialId: number) {
  deleteMaterial(db(), id.parse(materialId));
  revalidatePath("/lernen");
}

const planSchema = z.object({
  title: z.string().trim().min(1, "Wofür lernst du? Titel fehlt").max(80, "Titel: maximal 80 Zeichen"),
  subject: z.string().trim().max(60),
  examDay: day,
  minutesPerDay: z.coerce.number().int().min(15, "Mindestens 15 Minuten pro Tag").max(240, "Höchstens 240 Minuten pro Tag"),
  freeWeekdays: z.array(z.coerce.number().int().min(0).max(6)).max(6, "Mindestens ein Lerntag pro Woche"),
  materialIds: z.array(z.coerce.number().int().positive()).max(30),
});

export async function createStudyPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = planSchema.safeParse({
    title: formData.get("title") ?? "",
    subject: formData.get("subject") ?? "",
    examDay: formData.get("examDay") ?? "",
    minutesPerDay: formData.get("minutesPerDay") ?? "",
    freeWeekdays: formData.getAll("freeWeekdays"),
    materialIds: formData.getAll("materialIds"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.path[0] === "examDay" ? "Bitte ein Klausurdatum wählen" : issue.message };
  }
  const p = parsed.data;
  const now = today(env().APP_TZ);
  if (p.examDay <= now) return { ok: false, message: "Die Klausur muss in der Zukunft liegen" };
  const req = { ...p, subject: p.subject || null };
  let planId: number;
  try {
    const sessions = await generateStudyPlan(db(), req, now);
    planId = savePlan(db(), req, sessions);
  } catch (err) {
    return studyFailure(err);
  }
  revalidatePath("/lernen", "layout");
  revalidatePath("/briefing");
  redirect(`/lernen/plan?id=${planId}`);
}

export async function toggleStudySessionAction(sessionId: number) {
  toggleSession(db(), id.parse(sessionId));
  revalidatePath("/lernen", "layout");
  revalidatePath("/briefing");
}

export async function archivePlanAction(planId: number, archived: boolean) {
  setPlanArchived(db(), id.parse(planId), z.boolean().parse(archived));
  revalidatePath("/lernen", "layout");
  revalidatePath("/briefing");
}

export async function deletePlanAction(planId: number) {
  deletePlan(db(), id.parse(planId));
  revalidatePath("/lernen", "layout");
  revalidatePath("/briefing");
  redirect("/lernen");
}

export async function generateFlashcardsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const materialId = id.safeParse(Number(formData.get("materialId")));
  const count = z.coerce.number().int().min(5).max(100).safeParse(formData.get("count"));
  if (!materialId.success) return { ok: false, message: "Ungültiges Material" };
  if (!count.success) return { ok: false, message: "5 bis 100 Karten" };
  try {
    const set = await generateFlashcards(db(), materialId.data, count.data);
    saveFlashcardSet(db(), { materialId: materialId.data, ...set });
  } catch (err) {
    return studyFailure(err);
  }
  revalidatePath("/lernen");
  return { ok: true, message: "Karteikarten erstellt – unten bei „Karteikarten“" };
}

export async function deleteFlashcardSetAction(setId: number) {
  deleteFlashcardSet(db(), id.parse(setId));
  revalidatePath("/lernen");
}
