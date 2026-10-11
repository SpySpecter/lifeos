import "server-only";
import { GMAIL_MODIFY, googleAccessToken, googleAccounts, googleKey, hasScope } from "@/integrations/google";
import type { DB } from "../db";
import { env } from "../env";
import { BudgetExceededError, monthSpendUsd, structuredCompletion } from "../openai";
import { getSettings } from "../settings";
import { ensureLabels, getMeta, listInbox, modify, trash, untrash } from "./gmail";
import {
  AI_SCHEMA,
  type AiVerdict,
  aiInput,
  applyPolicy,
  type Category,
  CATEGORIES,
  type Decision,
  instructions,
  type MailAction,
  type MailMeta,
  matchRule,
  protection,
  type Rule,
} from "./policy";

const FIRST_RUN_MAX = 300;
const RUN_MAX = 150;
const AI_BATCH = 30;

export type RunSummary = {
  accounts: number;
  scanned: number;
  kept: number;
  archived: number;
  trashed: number;
  pending: number;
  notes: string[];
};

export function loadRules(db: DB): Rule[] {
  return (
    db.prepare("SELECT match_type, pattern, action, category FROM mail_rules ORDER BY id DESC").all() as {
      match_type: Rule["matchType"];
      pattern: string;
      action: MailAction;
      category: Category | null;
    }[]
  ).map((r) => ({ matchType: r.match_type, pattern: r.pattern, action: r.action, category: r.category }));
}

export function upsertRule(db: DB, rule: Rule, source: "nutzer" | "gelernt"): void {
  db.prepare(
    "INSERT INTO mail_rules (match_type, pattern, action, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(match_type, pattern) DO UPDATE SET action = excluded.action, category = excluded.category, source = excluded.source",
  ).run(rule.matchType, rule.pattern.toLowerCase(), rule.action, rule.category, source, Date.now());
}

function record(db: DB, account: string, m: MailMeta, d: Decision): void {
  db.prepare(
    `INSERT INTO mail_items (account, id, thread_id, from_name, from_email, subject, snippet, date, category, action, status, confidence, reason, source, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account, id) DO UPDATE SET category = excluded.category, action = excluded.action, status = excluded.status,
       confidence = excluded.confidence, reason = excluded.reason, source = excluded.source, processed_at = excluded.processed_at`,
  ).run(
    account,
    m.id,
    m.threadId,
    m.fromName,
    m.fromEmail,
    m.subject,
    m.snippet.slice(0, 300),
    m.date,
    d.category,
    d.action,
    d.status,
    d.confidence,
    d.reason,
    d.source,
    Date.now(),
  );
}

async function classifyWithAi(db: DB, mails: MailMeta[], profile: string): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  for (let i = 0; i < mails.length; i += AI_BATCH) {
    const batch = mails.slice(i, i + AI_BATCH);
    const res = await structuredCompletion<{ results: (AiVerdict & { i: number })[] }>(db, {
      purpose: "mail-triage",
      instructions: instructions(profile),
      input: aiInput(batch),
      schemaName: "mail_triage",
      schema: AI_SCHEMA as unknown as Record<string, unknown>,
    });
    for (const r of res.results) {
      const mail = batch[r.i];
      if (!mail || !CATEGORIES.includes(r.category)) continue;
      out.set(mail.id, applyPolicy({ ...r, confidence: Math.max(0, Math.min(1, r.confidence)) }));
    }
  }
  return out;
}

/** Führt eine Aktion in Gmail aus. Labels werden immer gesetzt, damit man in Gmail sieht, was LifeOS getan hat. */
async function execute(token: string, labels: Map<Category, string>, id: string, action: MailAction, category: Category | null) {
  const label = category ? labels.get(category) : undefined;
  const add = label ? [label] : [];
  if (action === "archive") await modify(token, [id], add, ["INBOX"]);
  else await modify(token, [id], add, []);
  if (action === "trash") await trash(token, id);
}

export async function runTriage(db: DB, trigger: "timer" | "manuell"): Promise<RunSummary> {
  const running = db
    .prepare("SELECT id FROM mail_runs WHERE finished_at IS NULL AND started_at > ?")
    .get(Date.now() - 20 * 60_000) as { id: number } | undefined;
  if (running) throw new Error("Die Mail-Sortierung läuft bereits");

  const runId = Number(db.prepare("INSERT INTO mail_runs (started_at, trigger) VALUES (?, ?)").run(Date.now(), trigger).lastInsertRowid);
  const summary: RunSummary = { accounts: 0, scanned: 0, kept: 0, archived: 0, trashed: 0, pending: 0, notes: [] };

  try {
    const profile = getSettings(db).mailProfile;
    const rules = loadRules(db);
    const aiAvailable = Boolean(env().OPENAI_API_KEY);
    if (!aiAvailable) summary.notes.push("OPENAI_API_KEY fehlt – nur Regeln aktiv");

    for (const account of await googleAccounts()) {
      if (!hasScope(account, GMAIL_MODIFY)) {
        summary.notes.push(`${account}: Schreibrechte fehlen – in den Einstellungen neu verbinden`);
        continue;
      }
      summary.accounts++;
      const token = await googleAccessToken(googleKey(account));
      const known = db.prepare("SELECT COUNT(*) AS n FROM mail_items WHERE account = ?").get(account) as { n: number };
      const ids = await listInbox(token, known.n ? RUN_MAX : FIRST_RUN_MAX);
      const seen = new Set(
        (db.prepare("SELECT id FROM mail_items WHERE account = ?").all(account) as { id: string }[]).map((r) => r.id),
      );
      const fresh = ids.filter((id) => !seen.has(id));
      if (!fresh.length) continue;

      const metas: MailMeta[] = [];
      for (let i = 0; i < fresh.length; i += 10) {
        metas.push(...(await Promise.all(fresh.slice(i, i + 10).map((id) => getMeta(token, id)))));
      }
      summary.scanned += metas.length;

      const decisions = new Map<string, Decision>();
      const forAi: MailMeta[] = [];
      for (const m of metas) {
        const p = protection(m);
        const rule = p ? null : matchRule(m, rules);
        if (p) decisions.set(m.id, p);
        else if (rule) {
          decisions.set(m.id, {
            category: rule.category,
            action: rule.action,
            status: "done",
            confidence: null,
            reason: `Regel: ${rule.pattern}`,
            source: "regel",
          });
        } else forAi.push(m);
      }

      if (forAi.length && aiAvailable) {
        try {
          for (const [id, d] of await classifyWithAi(db, forAi, profile)) decisions.set(id, d);
        } catch (err) {
          // Budget aufgebraucht oder API-Fehler: diese Mails bleiben unverändert und kommen beim nächsten Lauf wieder dran
          summary.notes.push(err instanceof BudgetExceededError ? err.message : `KI-Fehler: ${(err as Error).message}`);
        }
      }

      const labels = await ensureLabels(token);
      for (const m of metas) {
        const d = decisions.get(m.id);
        if (!d) continue;
        try {
          if (d.status === "done") await execute(token, labels, m.id, d.action, d.category);
          record(db, account, m, d);
          if (d.status === "pending") summary.pending++;
          else if (d.action === "trash") summary.trashed++;
          else if (d.action === "archive") summary.archived++;
          else summary.kept++;
        } catch (err) {
          summary.notes.push(`${m.subject.slice(0, 40)}: ${(err as Error).message}`);
        }
      }
    }
    db.prepare("UPDATE mail_runs SET finished_at = ?, summary = ? WHERE id = ?").run(Date.now(), JSON.stringify(summary), runId);
    return summary;
  } catch (err) {
    db.prepare("UPDATE mail_runs SET finished_at = ?, error = ?, summary = ? WHERE id = ?").run(
      Date.now(),
      (err as Error).message,
      JSON.stringify(summary),
      runId,
    );
    throw err;
  }
}

type ItemRow = { account: string; id: string; from_email: string; category: Category | null; action: MailAction; status: string };

function item(db: DB, account: string, id: string): ItemRow {
  const row = db
    .prepare("SELECT account, id, from_email, category, action, status FROM mail_items WHERE account = ? AND id = ?")
    .get(account, id) as ItemRow | undefined;
  if (!row) throw new Error("Mail nicht gefunden");
  return row;
}

/** Nutzerentscheidung (offene Mail oder Korrektur): ausführen und als Absender-Regel merken. */
export async function decideMail(db: DB, account: string, id: string, action: MailAction): Promise<void> {
  const row = item(db, account, id);
  const token = await googleAccessToken(googleKey(account));
  if (row.status === "done" && row.action === "trash") await untrash(token, id);
  if (row.status === "done" && row.action === "archive" && action !== "archive") await modify(token, [id], ["INBOX"], []);
  await execute(token, await ensureLabels(token), id, action, row.category);
  db.prepare("UPDATE mail_items SET action = ?, status = 'done', source = 'nutzer', decided_at = ? WHERE account = ? AND id = ?").run(
    action,
    Date.now(),
    account,
    id,
  );
  upsertRule(db, { matchType: "sender", pattern: row.from_email, action, category: row.category }, "gelernt");
}

/** Automatische Aktion rückgängig machen: Mail zurück in den Posteingang, Absender künftig behalten. */
export async function undoMail(db: DB, account: string, id: string): Promise<void> {
  const row = item(db, account, id);
  const token = await googleAccessToken(googleKey(account));
  if (row.action === "trash") await untrash(token, id);
  await modify(token, [id], ["INBOX"], []);
  db.prepare("UPDATE mail_items SET status = 'undone', decided_at = ? WHERE account = ? AND id = ?").run(Date.now(), account, id);
  upsertRule(db, { matchType: "sender", pattern: row.from_email, action: "keep", category: row.category }, "gelernt");
}

export type MailAssistantData = {
  pending: MailRow[];
  recent: MailRow[];
  today: { archived: number; trashed: number; kept: number };
  lastRun: { at: number; summary: RunSummary | null; error: string | null } | null;
  needsReconnect: string[];
  aiConfigured: boolean;
  monthUsd: number;
  budgetUsd: number;
};
export type MailRow = {
  account: string;
  id: string;
  fromName: string;
  subject: string;
  category: Category | null;
  action: MailAction;
  reason: string | null;
  confidence: number | null;
  processedAt: number;
};

const rowSelect =
  "SELECT account, id, from_name AS fromName, subject, category, action, reason, confidence, processed_at AS processedAt FROM mail_items";

export async function mailAssistantData(db: DB): Promise<MailAssistantData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const counts = db
    .prepare("SELECT action, COUNT(*) AS n FROM mail_items WHERE status = 'done' AND processed_at >= ? GROUP BY action")
    .all(startOfDay.getTime()) as { action: MailAction; n: number }[];
  const n = (a: MailAction) => counts.find((c) => c.action === a)?.n ?? 0;
  const run = db.prepare("SELECT finished_at, summary, error FROM mail_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as
    | { finished_at: number; summary: string | null; error: string | null }
    | undefined;
  const accounts = await googleAccounts();
  return {
    pending: db.prepare(`${rowSelect} WHERE status = 'pending' ORDER BY date DESC LIMIT 20`).all() as MailRow[],
    recent: db
      .prepare(`${rowSelect} WHERE status = 'done' AND source != 'nutzer' AND action IN ('trash', 'archive') ORDER BY processed_at DESC, date DESC LIMIT 8`)
      .all() as MailRow[],
    today: { archived: n("archive"), trashed: n("trash"), kept: n("keep") },
    lastRun: run ? { at: run.finished_at, summary: run.summary ? JSON.parse(run.summary) : null, error: run.error } : null,
    needsReconnect: accounts.filter((a) => !hasScope(a, GMAIL_MODIFY)),
    aiConfigured: Boolean(env().OPENAI_API_KEY),
    monthUsd: monthSpendUsd(db),
    budgetUsd: env().OPENAI_MONTHLY_BUDGET_USD,
  };
}
