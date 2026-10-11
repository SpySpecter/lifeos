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
];

export type DB = DatabaseSync;

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

const globalForDb = globalThis as unknown as { lifeosDb?: DB };

/** Eine Verbindung pro Prozess (überlebt Hot Reload im Dev-Modus). Demo-Modus nutzt eine eigene Datei. */
export function db(): DB {
  if (!globalForDb.lifeosDb) {
    const file = path.join(env().DATA_DIR, isDemo() ? "demo.db" : "lifeos.db");
    const conn = openDatabase(file);
    if (isDemo()) seedDemoData(conn);
    globalForDb.lifeosDb = conn;
  }
  return globalForDb.lifeosDb;
}
