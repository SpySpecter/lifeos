import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env, isDemo } from "./env";
import { seedDemoData } from "./demo-seed";

/**
 * SQLite über das eingebaute `node:sqlite` (kein natives Addon, kein Build-Schritt im Container).
 * Schema-Versionen laufen über `PRAGMA user_version`; jede Migration wird genau einmal angewendet.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '✅',
    position   INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE habit_checks (
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day      TEXT NOT NULL,
    PRIMARY KEY (habit_id, day)
  );
  CREATE TABLE health (
    day        TEXT NOT NULL,
    metric     TEXT NOT NULL,
    value      REAL NOT NULL,
    source     TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (day, metric)
  );
  CREATE TABLE tokens (
    provider   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE oauth_state (
    state      TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    verifier   TEXT,
    created_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE mail_items (
    account      TEXT NOT NULL,
    id           TEXT NOT NULL,
    thread_id    TEXT,
    from_name    TEXT NOT NULL,
    from_email   TEXT NOT NULL,
    subject      TEXT NOT NULL,
    snippet      TEXT NOT NULL,
    date         INTEGER NOT NULL,
    category     TEXT,
    action       TEXT,
    status       TEXT NOT NULL,
    confidence   REAL,
    reason       TEXT,
    source       TEXT,
    processed_at INTEGER NOT NULL,
    decided_at   INTEGER,
    PRIMARY KEY (account, id)
  );
  CREATE INDEX mail_items_status ON mail_items (status, processed_at);
  CREATE TABLE mail_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_type TEXT NOT NULL,
    pattern    TEXT NOT NULL,
    action     TEXT NOT NULL,
    category   TEXT,
    source     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (match_type, pattern)
  );
  CREATE TABLE mail_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    trigger     TEXT NOT NULL,
    summary     TEXT,
    error       TEXT
  );
  CREATE TABLE llm_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    at            INTEGER NOT NULL,
    model         TEXT NOT NULL,
    purpose       TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      REAL NOT NULL
  );
  `,
  `
  ALTER TABLE habits ADD COLUMN remind_at TEXT; -- 'HH:MM' in APP_TZ, NULL = keine Erinnerung
  CREATE TABLE push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    device     TEXT,
    created_at INTEGER NOT NULL,
    last_ok_at INTEGER
  );
  CREATE TABLE habit_reminders_sent (
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day      TEXT NOT NULL,
    PRIMARY KEY (habit_id, day)
  );
  `,
  `
  -- ein Morgenbriefing pro Tag; data = NULL, solange nur der Push-Versand vorgemerkt ist
  CREATE TABLE briefings (
    day        TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    data       TEXT,
    pushed_at  INTEGER
  );
  `,
  `
  -- Lernen: hochgeladene Markdown-Texte (schon aus PDFs umgewandelt), KI-Lernpläne und Karteikarten
  CREATE TABLE study_materials (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    subject    TEXT,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE study_plans (
    id              INTEGER PRIMARY KEY,
    title           TEXT NOT NULL,
    subject         TEXT,
    exam_day        TEXT NOT NULL,
    minutes_per_day INTEGER NOT NULL,
    material_ids    TEXT NOT NULL, -- JSON-Array
    created_at      INTEGER NOT NULL,
    archived        INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE study_sessions (
    id      INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    topic   TEXT NOT NULL,
    tasks   TEXT NOT NULL, -- JSON-Array
    minutes INTEGER NOT NULL,
    done    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX study_sessions_day ON study_sessions (day);
  CREATE TABLE flashcard_sets (
    id          INTEGER PRIMARY KEY,
    material_id INTEGER REFERENCES study_materials(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL, -- fertiger RemNote-Text
    created_at  INTEGER NOT NULL
  );
  `,
];

export type DB = DatabaseSync;

/**
 * node:sqlite liefert Zeilen als Objekte ohne Prototyp. React lehnt solche Objekte als Props für Client-Komponenten ab,
 * daher alles, was in die UI geht, hierdurch schicken.
 */
export function plainRows<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) }) as T);
}

export function openDatabase(file: string): DB {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

const globalForDb = globalThis as unknown as { lifeosDb?: DB; lifeosDbVersion?: number };

/** Eine Verbindung pro Prozess (überlebt Hot Reload im Dev-Modus). Demo-Modus nutzt eine eigene Datei. */
export function db(): DB {
  if (!globalForDb.lifeosDb) {
    const file = path.join(env().DATA_DIR, isDemo() ? "demo.db" : "lifeos.db");
    const conn = openDatabase(file);
    if (isDemo()) seedDemoData(conn);
    globalForDb.lifeosDb = conn;
  } else if (globalForDb.lifeosDbVersion !== MIGRATIONS.length) {
    // Hot Reload mit neuer Migration: die alte Verbindung nachziehen statt Neustart
    migrate(globalForDb.lifeosDb);
  }
  globalForDb.lifeosDbVersion = MIGRATIONS.length;
  return globalForDb.lifeosDb;
}
