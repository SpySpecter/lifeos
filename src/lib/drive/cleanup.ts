import "server-only";
import { DRIVE_WRITE, googleAccessToken, googleAccounts, googleKey, hasScope } from "@/integrations/google";
import { type DB, plainRows } from "../db";
import { env } from "../env";
import { BudgetExceededError, structuredCompletion } from "../openai";
import { sendToAll, type Sender } from "../push";
import { getSettings } from "../settings";
import { listOwnFiles, trashFile, untrashFile } from "./api";
import {
  AI_SCHEMA,
  type AiDriveVerdict,
  aiInput,
  applyDrivePolicy,
  type DriveDecision,
  type DriveFile,
  duplicates,
  type Example,
  instructions,
  needsReview,
  protection,
  ruleVerdict,
} from "./policy";

/**
 * Drive aufräumen: ein Lauf pro Knopfdruck, im Hintergrund. Unnötiges landet im Drive-Papierkorb (30 Tage wiederherstellbar),
 * Unklares wird Luis auf /drive gezeigt, Relevantes bleibt ohne Frage. Endgültig gelöscht wird nie etwas.
 */

const MAX_FILES = 5000;
const AI_BATCH = 100;
/** Ein Lauf, der länger als das ohne Ende hängt, gilt als abgestürzt und sperrt nicht mehr. */
const LOCK_MS = 60 * 60_000;

export type DriveSummary = {
  accounts: number;
  scanned: number;
  skipped: number;
  relevant: number;
  unklar: number;
  trashed: number;
  notes: string[];
};
export type DriveProgress = { account: string; step: string; done: number; total: number };

export type DriveDeps = {
  trash: (id: string) => Promise<void>;
  /** KI-Einordnung; Dateien ohne Ergebnis bleiben unbewertet und kommen beim nächsten Lauf wieder dran. */
  classify: (files: DriveFile[]) => Promise<Map<string, DriveDecision>>;
};

const emptySummary = (): DriveSummary => ({ accounts: 0, scanned: 0, skipped: 0, relevant: 0, unklar: 0, trashed: 0, notes: [] });

type KnownRow = {
  id: string;
  modifiedAt: number;
  decidedAt: number | null;
  reason: string;
  source: string;
  processedAt: number;
  status: string;
};

function record(db: DB, account: string, f: DriveFile, d: DriveDecision, status: string): void {
  db.prepare(
    `INSERT INTO drive_items (account, id, name, mime, path, size, modified_at, viewed_at, url, verdict, confidence, reason, source, status, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account, id) DO UPDATE SET name = excluded.name, mime = excluded.mime, path = excluded.path, size = excluded.size,
       modified_at = excluded.modified_at, viewed_at = excluded.viewed_at, url = excluded.url, verdict = excluded.verdict,
       confidence = excluded.confidence, reason = excluded.reason, source = excluded.source, status = excluded.status,
       processed_at = excluded.processed_at, decided_at = NULL`,
  ).run(
    account,
    f.id,
    f.name,
    f.mime,
    f.path,
    f.size,
    f.modifiedAt,
    f.viewedAt,
    f.url,
    d.verdict,
    d.confidence,
    d.reason,
    d.source,
    status,
    Date.now(),
  );
}

/** Ordnet die Dateien eines Kontos ein und legt Unnötiges in den Papierkorb. Ohne Netzwerk testbar (deps). */
export async function processFiles(
  db: DB,
  account: string,
  files: DriveFile[],
  deps: DriveDeps,
  summary: DriveSummary,
  opts: { protectedFolders: string[]; now?: number; onProgress?: (p: DriveProgress) => void },
): Promise<void> {
  const now = opts.now ?? Date.now();
  const progress = (step: string, done: number, total: number) => opts.onProgress?.({ account, step, done, total });
  const known = new Map(
    (
      db
        .prepare(
          `SELECT id, modified_at AS modifiedAt, decided_at AS decidedAt, reason, source, processed_at AS processedAt, status
           FROM drive_items WHERE account = ?`,
        )
        .all(account) as KnownRow[]
    ).map((r) => [r.id, r]),
  );

  // Taucht eine Datei aus dem LifeOS-Papierkorb wieder auf, hat Luis sie in Drive selbst wiederhergestellt → nie wieder anfassen
  const restored = db.prepare("UPDATE drive_items SET status = 'wiederhergestellt', decided_at = ? WHERE account = ? AND id = ?");
  for (const f of files) {
    if (known.get(f.id)?.status === "papierkorb") {
      restored.run(now, account, f.id);
      known.set(f.id, { ...known.get(f.id)!, decidedAt: now });
    }
  }

  const dupes = duplicates(files);
  const todo = files.filter((f) => needsReview(f, known.get(f.id), now));
  summary.scanned += files.length;
  summary.skipped += files.length - todo.length;

  const decisions = new Map<string, DriveDecision>();
  const forAi: DriveFile[] = [];
  for (const f of todo) {
    const d = protection(f, opts.protectedFolders, now) ?? ruleVerdict(f, dupes);
    if (d) decisions.set(f.id, d);
    else forAi.push(f);
  }

  if (forAi.length) {
    progress("KI prüft", 0, forAi.length);
    try {
      for (const [id, d] of await deps.classify(forAi)) decisions.set(id, d);
    } catch (err) {
      // Budget aufgebraucht o. Ä.: diese Dateien bleiben unbewertet und kommen beim nächsten Lauf dran
      summary.notes.push((err as Error).message);
    }
  }

  const toTrash = todo.filter((f) => decisions.get(f.id)?.verdict === "unnoetig");
  let trashed = 0;
  for (const f of todo) {
    const d = decisions.get(f.id);
    if (!d) continue;
    if (d.verdict === "unnoetig") {
      progress("Papierkorb", trashed, toTrash.length);
      try {
        await deps.trash(f.id);
        record(db, account, f, d, "papierkorb");
        summary.trashed++;
      } catch (err) {
        summary.notes.push(`„${f.name}“ nicht in den Papierkorb gelegt: ${(err as Error).message}`);
      }
      trashed++;
      continue;
    }
    record(db, account, f, d, d.verdict === "relevant" ? "behalten" : "offen");
    if (d.verdict === "relevant") summary.relevant++;
    else summary.unklar++;
  }
}

/** Letzte Entscheidungen von Luis als Beispiele für die KI. */
function examples(db: DB): Example[] {
  return (
    db
      .prepare(
        "SELECT name, path, status FROM drive_items WHERE decided_at IS NOT NULL AND status IN ('behalten', 'papierkorb', 'wiederhergestellt') ORDER BY decided_at DESC LIMIT 25",
      )
      .all() as { name: string; path: string; status: string }[]
  ).map((r) => ({ name: r.name, path: r.path, kept: r.status !== "papierkorb" }));
}

function aiClassifier(db: DB, notes: string[]): DriveDeps["classify"] {
  // Nur die erste Zeile des Mail-Profils („Ich bin Schüler …“) – die Mail-Regeln selbst gehören nicht hierher
  const profile = getSettings(db).mailProfile.split("\n")[0];
  const ex = examples(db);
  return async (files) => {
    const out = new Map<string, DriveDecision>();
    for (let i = 0; i < files.length; i += AI_BATCH) {
      const batch = files.slice(i, i + AI_BATCH);
      let res: { results: (AiDriveVerdict & { i: number })[] } | null = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try {
          res = await structuredCompletion(db, {
            purpose: "drive-aufraeumen",
            instructions: instructions(profile, ex),
            input: aiInput(batch),
            schemaName: "drive_cleanup",
            schema: AI_SCHEMA as unknown as Record<string, unknown>,
          });
        } catch (err) {
          if (err instanceof BudgetExceededError) {
            notes.push(`${err.message} – ${files.length - i} Dateien bleiben für später`);
            return out;
          }
          if (attempt === 1) notes.push(`KI-Paket übersprungen (${batch.length} Dateien): ${(err as Error).message}`);
        }
      }
      for (const r of res?.results ?? []) {
        const f = batch[r.i];
        if (!f || !["relevant", "unklar", "unnoetig"].includes(r.verdict)) continue;
        out.set(f.id, applyDrivePolicy(r, f));
      }
    }
    return out;
  };
}

function setProgress(db: DB, runId: number, p: DriveProgress): void {
  db.prepare("UPDATE drive_runs SET progress = ? WHERE id = ?").run(JSON.stringify(p), runId);
}

export async function runDriveCleanup(db: DB, runId: number, send?: Sender): Promise<DriveSummary> {
  const summary = emptySummary();
  try {
    const { driveProtected } = getSettings(db);
    const aiAvailable = Boolean(env().OPENAI_API_KEY);
    if (!aiAvailable) summary.notes.push("OPENAI_API_KEY fehlt – nur feste Regeln aktiv, der Rest bleibt unbewertet");

    for (const account of await googleAccounts()) {
      if (!hasScope(account, DRIVE_WRITE)) {
        summary.notes.push(`${account}: Drive-Rechte fehlen – in den Einstellungen neu verbinden`);
        continue;
      }
      summary.accounts++;
      setProgress(db, runId, { account, step: "Dateien laden", done: 0, total: 0 });
      const token = await googleAccessToken(googleKey(account));
      const files = await listOwnFiles(token, MAX_FILES);
      if (files.length >= MAX_FILES) summary.notes.push(`${account}: mehr als ${MAX_FILES} Dateien – beim nächsten Lauf geht es weiter`);
      await processFiles(
        db,
        account,
        files,
        {
          trash: (id) => trashFile(token, id),
          classify: aiAvailable ? aiClassifier(db, summary.notes) : async () => new Map(),
        },
        summary,
        { protectedFolders: driveProtected, onProgress: (p) => setProgress(db, runId, p) },
      );
    }
    db.prepare("UPDATE drive_runs SET finished_at = ?, summary = ?, progress = NULL WHERE id = ?").run(
      Date.now(),
      JSON.stringify(summary),
      runId,
    );
  } catch (err) {
    db.prepare("UPDATE drive_runs SET finished_at = ?, error = ?, summary = ?, progress = NULL WHERE id = ?").run(
      Date.now(),
      (err as Error).message,
      JSON.stringify(summary),
      runId,
    );
    throw err;
  }

  if (summary.trashed || summary.unklar) {
    const r = await sendToAll(db, driveMessage(summary), send);
    if (r.failed) console.warn(`[drive] Push: ${r.failed} fehlgeschlagen (${r.errors.join(", ")})`);
  }
  return summary;
}

export function driveMessage(s: Pick<DriveSummary, "trashed" | "unklar">) {
  const questions = s.unklar === 1 ? "1 Frage offen" : `${s.unklar} Fragen offen`;
  return { title: "🗂️ Drive aufgeräumt", body: `${s.trashed} im Papierkorb, ${questions}`, url: "/drive", tag: "drive-cleanup" };
}

/** Startet einen Lauf im Hintergrund – oder bricht ab, wenn gerade einer läuft. */
export function startDriveCleanup(db: DB, send?: Sender): number {
  const running = db.prepare("SELECT id FROM drive_runs WHERE finished_at IS NULL AND started_at > ?").get(Date.now() - LOCK_MS) as
    | { id: number }
    | undefined;
  if (running) throw new Error("Das Aufräumen läuft bereits");
  const runId = Number(db.prepare("INSERT INTO drive_runs (started_at) VALUES (?)").run(Date.now()).lastInsertRowid);
  runDriveCleanup(db, runId, send).catch((err) => console.error("[drive]", (err as Error).message));
  return runId;
}

type ItemRow = { account: string; id: string; status: string };

function item(db: DB, account: string, id: string): ItemRow {
  const row = db.prepare("SELECT account, id, status FROM drive_items WHERE account = ? AND id = ?").get(account, id) as ItemRow | undefined;
  if (!row) throw new Error("Datei nicht gefunden");
  return row;
}

/** Status in LifeOS setzen (ohne Drive) – nach der Drive-Aktion und im Demo-Modus. */
export function markDriveItem(db: DB, account: string, id: string, status: "behalten" | "papierkorb" | "wiederhergestellt"): void {
  db.prepare("UPDATE drive_items SET status = ?, verdict = ?, decided_at = ? WHERE account = ? AND id = ?").run(
    status,
    status === "papierkorb" ? "unnoetig" : "relevant",
    Date.now(),
    account,
    id,
  );
}

/** Luis entscheidet über eine unklare Datei (oder korrigiert eine automatische Entscheidung). */
export async function decideDriveItem(db: DB, account: string, id: string, choice: "behalten" | "papierkorb"): Promise<void> {
  const row = item(db, account, id);
  const token = await googleAccessToken(googleKey(account));
  if (choice === "papierkorb" && row.status !== "papierkorb") await trashFile(token, id);
  if (choice === "behalten" && row.status === "papierkorb") await untrashFile(token, id);
  markDriveItem(db, account, id, choice);
}

/** Automatisch in den Papierkorb gelegte Datei zurückholen; sie wird danach nie wieder angefasst. */
export async function undoDriveItem(db: DB, account: string, id: string): Promise<void> {
  const row = item(db, account, id);
  if (row.status !== "papierkorb") return;
  await untrashFile(await googleAccessToken(googleKey(account)), id);
  markDriveItem(db, account, id, "wiederhergestellt");
}

export type DriveRow = {
  account: string;
  id: string;
  name: string;
  mime: string;
  path: string;
  size: number | null;
  modifiedAt: number;
  url: string | null;
  reason: string;
  confidence: number | null;
  source: string;
  processedAt: number;
};

export type DriveCleanupData = {
  running: { startedAt: number; progress: DriveProgress | null } | null;
  lastRun: { at: number; summary: DriveSummary | null; error: string | null } | null;
  pending: DriveRow[];
  trashed: DriveRow[];
  counts: { offen: number; papierkorb: number; behalten: number };
  needsReconnect: string[];
  aiConfigured: boolean;
};

const rowSelect = `SELECT account, id, name, mime, path, size, modified_at AS modifiedAt, url, reason, confidence, source,
  processed_at AS processedAt FROM drive_items`;

export async function driveCleanupData(db: DB, accounts: string[]): Promise<DriveCleanupData> {
  const run = db
    .prepare("SELECT started_at, progress FROM drive_runs WHERE finished_at IS NULL AND started_at > ? ORDER BY id DESC LIMIT 1")
    .get(Date.now() - LOCK_MS) as { started_at: number; progress: string | null } | undefined;
  const last = db.prepare("SELECT finished_at, summary, error FROM drive_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as
    | { finished_at: number; summary: string | null; error: string | null }
    | undefined;
  const counts = db.prepare("SELECT status, COUNT(*) AS n FROM drive_items GROUP BY status").all() as { status: string; n: number }[];
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  return {
    running: run ? { startedAt: run.started_at, progress: run.progress ? JSON.parse(run.progress) : null } : null,
    lastRun: last ? { at: last.finished_at, summary: last.summary ? JSON.parse(last.summary) : null, error: last.error } : null,
    pending: plainRows<DriveRow>(db.prepare(`${rowSelect} WHERE status = 'offen' ORDER BY modified_at DESC LIMIT 100`).all()),
    trashed: plainRows<DriveRow>(
      db.prepare(`${rowSelect} WHERE status = 'papierkorb' AND decided_at IS NULL ORDER BY processed_at DESC, name LIMIT 100`).all(),
    ),
    counts: { offen: n("offen"), papierkorb: n("papierkorb"), behalten: n("behalten") },
    needsReconnect: accounts.filter((a) => !hasScope(a, DRIVE_WRITE)),
    aiConfigured: Boolean(env().OPENAI_API_KEY),
  };
}
