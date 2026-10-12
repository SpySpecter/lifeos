import "server-only";
import { daysUntil } from "@/integrations/exams";
import { plainRows, type DB } from "./db";
import { env, isDemo } from "./env";
import { focusMinutesBySubject } from "./focus";
import { structuredCompletion } from "./openai";
import { addDays, formatDayLong, weekdayShort, zonedToEpoch } from "./time";

/**
 * Lernen: Markdown-Material (vorher aus PDFs umgewandelt – das spart Token gegenüber PDFs), daraus
 * KI-Lernpläne bis zur Klausur und Karteikarten (gespeichert und wiederholt in `flashcards.ts`).
 */

export type Material = { id: number; title: string; subject: string | null; chars: number; createdAt: number; preview: string };
export type MaterialText = { id: number; title: string; subject: string | null; content: string };

export type StudySession = { id: number; planId: number; day: string; topic: string; tasks: string[]; minutes: number; done: boolean };
export type TodaySession = StudySession & { planTitle: string; overdue: boolean };
export type PlannedSession = Pick<StudySession, "day" | "topic" | "tasks" | "minutes">;

export type StudyPlan = {
  id: number;
  title: string;
  subject: string | null;
  examDay: string;
  minutesPerDay: number;
  materialIds: number[];
  createdAt: number;
  archived: boolean;
  total: number;
  done: number;
  /** nächste offene Einheit */
  nextDay: string | null;
};

export type CardSection = { heading: string; cards: { front: string; back: string }[] };

/** Fehler mit Text für die Oberfläche. */
export class StudyError extends Error {}

// ---------------------------------------------------------------------------
// Material vorbereiten

/** Grob 4 Zeichen pro Token – reicht für die Kostenschätzung vor dem Absenden. */
export const CHARS_PER_TOKEN = 4;
/** Obergrenze Material pro KI-Anfrage (~50k Token); mehr wird anteilig gekürzt. */
export const MAX_CONTEXT_CHARS = 200_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Zeilen, die auf fast jeder PDF-Seite stehen (Kopf-/Fußzeilen), sind für die KI nur Ballast. */
function dropRepeatedLines(text: string): string {
  const counts = new Map<string, number>();
  const lines = text.split("\n");
  for (const l of lines) {
    const t = l.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const seen = new Set<string>();
  return lines
    .filter((l) => {
      const t = l.trim();
      // Überschriften, Listen und Tabellen dürfen sich wiederholen
      if (!t || t.length > 80 || /^([#|>*+-]|\d+\.)/.test(t) || !/\p{L}/u.test(t) || (counts.get(t) ?? 0) < 4) return true;
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .join("\n");
}

/** Entfernt, was nur Token kostet: Bilder, Data-URIs, HTML-Kommentare, Link-Ziele, Seitenzahlen, Kopfzeilen, Leerzeilen. */
export function prepareMaterial(md: string): string {
  const cleaned = md
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, "")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/^[ \t]*(?:seite[ \t]+)?\d{1,4}(?:[ \t]*(?:\/|von)[ \t]*\d{1,4})?[ \t]*$/gim, "")
    .replace(/[ \t]+$/gm, "");
  return dropRepeatedLines(cleaned)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const estimateTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** Material für die KI zusammenstellen; zu langes wird anteilig gekürzt (mit Hinweis im Text). */
export function materialContext(materials: Pick<MaterialText, "title" | "content">[], max = MAX_CONTEXT_CHARS): { text: string; truncated: boolean } {
  const total = materials.reduce((n, m) => n + m.content.length, 0);
  const scale = total > max ? max / total : 1;
  const text = materials
    .map((m) => {
      const keep = Math.floor(m.content.length * scale);
      const body = keep < m.content.length ? `${m.content.slice(0, keep)}\n[… gekürzt]` : m.content;
      return `## Material: ${m.title}\n\n${body}`;
    })
    .join("\n\n");
  return { text, truncated: scale < 1 };
}

/** Überschriften mit dem ersten Satz darunter – für Demo-Pläne und -Karten ohne KI. */
export function outline(md: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  for (const line of md.split("\n")) {
    const h = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (h) {
      out.push({ heading: h[1].replace(/[*_`]/g, "").trim(), text: "" });
      continue;
    }
    const last = out.at(-1);
    const t = line.replace(/^[-*+]\s+|^\d+\.\s+/, "").replace(/[*_`]/g, "").trim();
    if (last && !last.text && t) last.text = (/^.+?[.!?](?=\s|$)/.exec(t)?.[0] ?? t).slice(0, 200);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Datenbank

type MaterialRow = { id: number; title: string; subject: string | null; chars: number; created_at: number; preview: string };

export function addMaterial(db: DB, m: { title: string; subject: string | null; content: string }): number {
  const res = db
    .prepare("INSERT INTO study_materials (title, subject, content, created_at) VALUES (?, ?, ?, ?)")
    .run(m.title, m.subject, m.content, Date.now());
  return Number(res.lastInsertRowid);
}

export function listMaterials(db: DB): Material[] {
  const rows = db
    .prepare(
      "SELECT id, title, subject, length(content) AS chars, created_at, substr(content, 1, 400) AS preview FROM study_materials ORDER BY created_at DESC, id DESC",
    )
    .all() as MaterialRow[];
  return rows.map((r) => ({ id: r.id, title: r.title, subject: r.subject, chars: r.chars, createdAt: r.created_at, preview: r.preview }));
}

export function getMaterials(db: DB, ids: number[]): MaterialText[] {
  if (!ids.length) return [];
  const rows = db
    .prepare(`SELECT id, title, subject, content FROM study_materials WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`)
    .all(...ids);
  return plainRows<MaterialText>(rows);
}

export function deleteMaterial(db: DB, id: number): void {
  db.prepare("DELETE FROM study_materials WHERE id = ?").run(id);
}

type PlanRow = {
  id: number;
  title: string;
  subject: string | null;
  exam_day: string;
  minutes_per_day: number;
  material_ids: string;
  created_at: number;
  archived: number;
  total: number;
  done: number | null;
  next_day: string | null;
};

const toPlan = (r: PlanRow): StudyPlan => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  examDay: r.exam_day,
  minutesPerDay: r.minutes_per_day,
  materialIds: JSON.parse(r.material_ids) as number[],
  createdAt: r.created_at,
  archived: r.archived === 1,
  total: r.total,
  done: r.done ?? 0,
  nextDay: r.next_day,
});

const PLAN_SELECT =
  "SELECT p.*, COUNT(s.id) AS total, SUM(s.done) AS done, MIN(CASE WHEN s.done = 0 THEN s.day END) AS next_day " +
  "FROM study_plans p LEFT JOIN study_sessions s ON s.plan_id = p.id";

type SessionRow = { id: number; plan_id: number; day: string; topic: string; tasks: string; minutes: number; done: number };

const toSession = (r: SessionRow): StudySession => ({
  id: r.id,
  planId: r.plan_id,
  day: r.day,
  topic: r.topic,
  tasks: JSON.parse(r.tasks) as string[],
  minutes: r.minutes,
  done: r.done === 1,
});

export function savePlan(
  db: DB,
  p: { title: string; subject: string | null; examDay: string; minutesPerDay: number; materialIds: number[] },
  sessions: PlannedSession[],
): number {
  db.exec("BEGIN");
  try {
    const res = db
      .prepare("INSERT INTO study_plans (title, subject, exam_day, minutes_per_day, material_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(p.title, p.subject, p.examDay, p.minutesPerDay, JSON.stringify(p.materialIds), Date.now());
    const id = Number(res.lastInsertRowid);
    const insert = db.prepare("INSERT INTO study_sessions (plan_id, day, topic, tasks, minutes) VALUES (?, ?, ?, ?, ?)");
    for (const s of sessions) insert.run(id, s.day, s.topic, JSON.stringify(s.tasks), s.minutes);
    db.exec("COMMIT");
    return id;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Aktive Pläne, nächste Klausur zuerst. */
export function listPlans(db: DB, opts: { archived?: boolean } = {}): StudyPlan[] {
  const rows = db
    .prepare(`${PLAN_SELECT} WHERE p.archived = ? GROUP BY p.id ORDER BY p.exam_day, p.id`)
    .all(opts.archived ? 1 : 0) as PlanRow[];
  return rows.map(toPlan);
}

export function getPlan(db: DB, id: number): (StudyPlan & { sessions: StudySession[] }) | null {
  const row = db.prepare(`${PLAN_SELECT} WHERE p.id = ? GROUP BY p.id`).get(id) as PlanRow | undefined;
  if (!row) return null;
  const sessions = (db.prepare("SELECT * FROM study_sessions WHERE plan_id = ? ORDER BY day, id").all(id) as SessionRow[]).map(toSession);
  return { ...toPlan(row), sessions };
}

export function setPlanArchived(db: DB, id: number, archived: boolean): void {
  db.prepare("UPDATE study_plans SET archived = ? WHERE id = ?").run(archived ? 1 : 0, id);
}

export function deletePlan(db: DB, id: number): void {
  db.prepare("DELETE FROM study_plans WHERE id = ?").run(id);
}

export function toggleSession(db: DB, id: number): void {
  db.prepare("UPDATE study_sessions SET done = 1 - done WHERE id = ?").run(id);
}

const OVERDUE_DAYS = 3;

/** „in 5 Tagen“ samt Farbe – je näher die Klausur, desto auffälliger. */
export function examCountdown(examDay: string, day: string): { text: string; tone: string } {
  const d = daysUntil(examDay, day);
  return {
    text: d < 0 ? "vorbei" : d === 0 ? "Heute" : d === 1 ? "Morgen" : `in ${d} Tagen`,
    tone: d < 0 ? "text-muted-foreground" : d <= 2 ? "text-critical" : d <= 7 ? "text-warning" : "text-muted-foreground",
  };
}

/** Heutige Einheiten aller aktiven Pläne plus Liegengebliebenes der letzten 3 Tage (bis zur Klausur). */
export function todaysSessions(db: DB, day: string): TodaySession[] {
  const rows = db
    .prepare(
      "SELECT s.*, p.title AS plan_title FROM study_sessions s JOIN study_plans p ON p.id = s.plan_id " +
        "WHERE p.archived = 0 AND p.exam_day >= ? AND (s.day = ? OR (s.day < ? AND s.day >= ? AND s.done = 0)) " +
        "ORDER BY s.day, p.exam_day, s.id",
    )
    .all(day, day, day, addDays(day, -OVERDUE_DAYS)) as (SessionRow & { plan_title: string })[];
  return rows.map((r) => ({ ...toSession(r), planTitle: r.plan_title, overdue: r.day < day }));
}

/** Montag bis Sonntag der Woche von `day`, als Tage und als ms-Grenzen in der App-Zeitzone. */
export function weekRange(day: string, tz: string): { from: string; to: string; fromMs: number; toMs: number } {
  const from = addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
  const to = addDays(from, 6);
  return { from, to, fromMs: zonedToEpoch(from, "00:00", tz), toMs: zonedToEpoch(addDays(to, 1), "00:00", tz) };
}

/** 95 → „1 Std. 35 Min.“ */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} Std. ${min % 60} Min.` : `${h} Std.`;
}

export type StudyTime = { subject: string; planned: number; actual: number };

/**
 * Plan gegen Ist für eine Woche: geplante Minuten aus den Lernplänen (nach Plantitel) und gemessene aus dem
 * Fokus-Timer, zusammengeführt nach Fach (ohne Groß-/Kleinschreibung). `from`/`to` sind Tage, `fromMs`/`toMs` dieselben Grenzen in ms.
 */
export function studyTime(db: DB, range: { from: string; to: string; fromMs: number; toMs: number }): StudyTime[] {
  const planned = db
    .prepare(
      "SELECT p.title AS subject, SUM(s.minutes) AS minutes FROM study_sessions s JOIN study_plans p ON p.id = s.plan_id " +
        "WHERE s.day >= ? AND s.day <= ? GROUP BY lower(trim(p.title))",
    )
    .all(range.from, range.to) as { subject: string; minutes: number }[];
  const out = new Map<string, StudyTime>();
  const key = (s: string) => s.trim().toLowerCase();
  for (const r of planned) out.set(key(r.subject), { subject: r.subject.trim(), planned: r.minutes, actual: 0 });
  for (const [subject, minutes] of focusMinutesBySubject(db, range.fromMs, range.toMs)) {
    const k = key(subject);
    const cur = out.get(k);
    if (cur) cur.actual += minutes;
    else out.set(k, { subject: subject.trim(), planned: 0, actual: minutes });
  }
  return [...out.values()].sort((a, b) => Math.max(b.planned, b.actual) - Math.max(a.planned, a.actual) || a.subject.localeCompare(b.subject));
}

/** Offene Lernminuten für heute (inkl. Liegengebliebenem) – für die Briefing-Mitteilung. */
export const openStudyMinutes = (db: DB, day: string) =>
  todaysSessions(db, day)
    .filter((s) => !s.done)
    .reduce((n, s) => n + s.minutes, 0);

// ---------------------------------------------------------------------------
// KI: Lernplan

export const MAX_PLAN_DAYS = 60;

/** Lerntage von heute bis zum Tag vor der Klausur, ohne freie Wochentage (0 = Sonntag); bei langen Zeiträumen die letzten 60. */
export function studyDays(from: string, examDay: string, freeWeekdays: number[]): string[] {
  const days: string[] = [];
  for (let d = from; d < examDay && days.length < 400; d = addDays(d, 1)) {
    if (!freeWeekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) days.push(d);
  }
  return days.slice(-MAX_PLAN_DAYS);
}

/** Nur erlaubte Tage, höchstens eine Einheit pro Tag, Minuten im Rahmen – egal was die KI liefert. */
export function validateSessions(raw: PlannedSession[], days: string[], maxMinutes: number): PlannedSession[] {
  const allowed = new Set(days);
  const seen = new Set<string>();
  return raw
    .filter((s) => allowed.has(s.day) && s.topic.trim())
    .sort((a, b) => a.day.localeCompare(b.day))
    .filter((s) => !seen.has(s.day) && Boolean(seen.add(s.day)))
    .map((s) => ({
      day: s.day,
      topic: s.topic.trim().slice(0, 120),
      tasks: s.tasks
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((t) => t.slice(0, 240)),
      minutes: Math.min(maxMinutes, Math.max(10, Math.round(s.minutes) || maxMinutes)),
    }));
}

const PLAN_INSTRUCTIONS = `Du erstellst einen Lernplan für eine Klausur in der gymnasialen Oberstufe (Brandenburg).
Du bekommst die Klausur, die verfügbaren Lerntage (nur genau diese Daten verwenden!), die Minuten pro Tag und – falls vorhanden – Unterrichtsmaterial als Markdown.
Regeln:
- Höchstens eine Einheit pro Lerntag. Nicht jeder Tag muss belegt sein, aber verteile das Lernen über den ganzen Zeitraum (verteiltes Wiederholen statt alles am Ende).
- Leite die Themen aus dem Material ab (Überschriften, Schwerpunkte, Aufgabentypen). Ohne Material: die typischen Themen des Fachs zum genannten Klausurthema.
- Erst Stoff erarbeiten, dann üben, dann wiederholen: frühere Themen tauchen später kurz wieder auf.
- Die letzte Einheit ist eine Generalprobe (Probeklausur unter Zeitdruck oder gemischte Aufgaben). Kurz vor der Klausur nichts Neues mehr.
- topic: kurzer Titel der Einheit (höchstens 60 Zeichen). tasks: 2–4 konkrete, abhakbare Aufgaben, wenn möglich mit Bezug auf Abschnitte des Materials.
- minutes: höchstens die angegebenen Minuten pro Tag.
- Alles auf Deutsch.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sessions"],
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "topic", "tasks", "minutes"],
        properties: {
          day: { type: "string", description: "YYYY-MM-DD, einer der Lerntage" },
          topic: { type: "string" },
          tasks: { type: "array", items: { type: "string" } },
          minutes: { type: "integer" },
        },
      },
    },
  },
};

export type PlanRequest = {
  title: string;
  subject: string | null;
  examDay: string;
  minutesPerDay: number;
  freeWeekdays: number[];
  materialIds: number[];
};

export function planInput(req: PlanRequest, days: string[], materials: MaterialText[]): string {
  const head = [
    `Klausur: ${req.title}${req.subject && req.subject !== req.title ? ` (${req.subject})` : ""}`,
    `Klausurtag: ${formatDayLong(req.examDay)} (${req.examDay})`,
    `Minuten pro Tag: ${req.minutesPerDay}`,
    `Lerntage: ${days.map((d) => `${d} (${weekdayShort(d)})`).join(", ")}`,
  ].join("\n");
  return materials.length ? `${head}\n\n${materialContext(materials).text}` : `${head}\n\nKein Material hochgeladen.`;
}

/** Ohne KI (Demo-Modus): Themen aus den Überschriften, jeden zweiten Lerntag, am Ende Generalprobe. */
function demoPlan(days: string[], materials: MaterialText[], minutes: number): PlannedSession[] {
  const topics = materials.flatMap((m) => outline(m.content).map((o) => o.heading)).slice(0, 12);
  const list = topics.length ? topics : ["Grundlagen wiederholen", "Übungsaufgaben", "Schwierige Themen"];
  const picked = days.filter((_, i) => (days.length - 1 - i) % 2 === 0);
  return picked.map((day, i) =>
    i === picked.length - 1 && picked.length > 1
      ? { day, topic: "Generalprobe", tasks: ["Probeklausur unter Zeitdruck schreiben", "Fehler mit dem Material abgleichen"], minutes }
      : {
          day,
          topic: list[i % list.length],
          tasks: [`„${list[i % list.length]}“ im Material durcharbeiten`, "Drei Übungsaufgaben dazu lösen", "Karteikarten wiederholen"],
          minutes,
        },
  );
}

export async function generateStudyPlan(db: DB, req: PlanRequest, today: string): Promise<PlannedSession[]> {
  const days = studyDays(today, req.examDay, req.freeWeekdays);
  if (!days.length) throw new StudyError("Bis zur Klausur bleibt kein Lerntag – Datum oder freie Tage prüfen.");
  const materials = getMaterials(db, req.materialIds);
  if (isDemo()) return demoPlan(days, materials, req.minutesPerDay);
  if (!env().OPENAI_API_KEY) throw new StudyError("Für Lernpläne fehlt der OpenAI-Schlüssel (OPENAI_API_KEY).");
  const res = await structuredCompletion<{ sessions: PlannedSession[] }>(db, {
    purpose: "study-plan",
    instructions: PLAN_INSTRUCTIONS,
    input: planInput(req, days, materials),
    schemaName: "study_plan",
    schema: PLAN_SCHEMA,
  });
  const sessions = validateSessions(res.sessions, days, req.minutesPerDay);
  if (!sessions.length) throw new StudyError("Die KI hat keinen brauchbaren Plan geliefert – bitte noch einmal versuchen.");
  return sessions;
}

// ---------------------------------------------------------------------------
// KI: Karteikarten

const CARDS_INSTRUCTIONS = `Du erstellst Karteikarten zum Wiederholen (Spaced Repetition) aus Unterrichtsmaterial (Markdown) für einen Oberstufenschüler.
- Etwa so viele Karten wie verlangt, verteilt über das ganze Material, nach Abschnitten gruppiert (heading = Abschnitt bzw. Thema).
- front: präzise Frage oder Begriff. back: knappe, richtige Antwort (höchstens 1–2 Sätze oder eine kurze Aufzählung in einer Zeile).
- Eine Karte = ein Fakt. Keine Ja/Nein-Fragen, nichts zu Seitenzahlen, Aufgabennummern oder Formalien des Dokuments.
- Nur Inhalte aus dem Material. Formeln als Text (z. B. a^2 + b^2 = c^2).
- Sprache des Materials beibehalten (meist Deutsch; englisches Material → englische Karten).`;

const CARDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "cards"],
        properties: {
          heading: { type: "string" },
          cards: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["front", "back"],
              properties: { front: { type: "string" }, back: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

function demoCards(m: MaterialText, count: number): CardSection[] {
  const parts = outline(m.content).filter((o) => o.text);
  return [
    {
      heading: m.title,
      cards: parts.slice(0, count).map((o) => ({ front: `Worum geht es bei „${o.heading}“?`, back: o.text })),
    },
  ];
}

export async function generateFlashcards(
  db: DB,
  materialId: number,
  count: number,
): Promise<{ title: string; subject: string | null; cards: { front: string; back: string; section: string | null }[] }> {
  const [m] = getMaterials(db, [materialId]);
  if (!m) throw new StudyError("Material nicht gefunden.");
  let sections: CardSection[];
  if (isDemo()) sections = demoCards(m, count);
  else {
    if (!env().OPENAI_API_KEY) throw new StudyError("Für Karteikarten fehlt der OpenAI-Schlüssel (OPENAI_API_KEY).");
    const res = await structuredCompletion<{ sections: CardSection[] }>(db, {
      purpose: "flashcards",
      instructions: CARDS_INSTRUCTIONS,
      input: `Anzahl Karten: ${count}\n\n${materialContext([m]).text}`,
      schemaName: "flashcards",
      schema: CARDS_SCHEMA,
    });
    sections = res.sections;
  }
  const cards = sections.flatMap((s) =>
    s.cards
      .map((c) => ({ front: c.front.trim(), back: c.back.trim(), section: s.heading.replace(/^#+\s*/, "").trim() || null }))
      .filter((c) => c.front && c.back),
  );
  if (!cards.length) throw new StudyError("Aus diesem Material ließen sich keine Karten erstellen.");
  return { title: m.title, subject: m.subject, cards };
}
