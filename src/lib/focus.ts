import "server-only";
import type { DB } from "./db";
import { countSubscriptions, sendToAll, type PushMessage, type Sender } from "./push";

/**
 * Fokus-Sitzungen (Pomodoro oder Stoppuhr). Der Client zählt die Zeit; hier landen Fach, echte Minuten
 * und das Ende der laufenden Phase – damit der Push auch kommt, wenn Safari im Hintergrund schläft.
 */

export type FocusKind = "pomodoro" | "frei";
export type FocusPhase = "work" | "break";

/** Sitzungen ohne Abschluss werden nach so langer Zeit mit den zuletzt gemeldeten Minuten geschlossen. */
const STALE_MS = 12 * 3600_000;

export function startFocus(db: DB, f: { subject: string; studySessionId: number | null; kind: FocusKind; endsAt: number | null }, now = Date.now()): number {
  const res = db
    .prepare("INSERT INTO focus_sessions (subject, study_session_id, kind, started_at, phase, ends_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(f.subject.trim().slice(0, 80) || "Lernen", f.studySessionId, f.kind, now, f.endsAt ? "work" : null, f.endsAt);
  return Number(res.lastInsertRowid);
}

/** Phasenwechsel, Pause oder Weiter: neues Phasenende (oder keins) und die bisher fokussierten Minuten. */
export function updateFocus(db: DB, id: number, u: { phase: FocusPhase | null; endsAt: number | null; minutes: number }): void {
  db.prepare("UPDATE focus_sessions SET phase = ?, ends_at = ?, notified = 0, minutes = ? WHERE id = ? AND ended_at IS NULL").run(
    u.endsAt ? u.phase : null,
    u.endsAt,
    Math.max(0, Math.round(u.minutes)),
    id,
  );
}

/** Abschluss; optional die verknüpfte Lerneinheit als erledigt markieren. Unter einer Minute wird nichts gespeichert. */
export function finishFocus(db: DB, id: number, minutes: number, markDone = false, now = Date.now()): void {
  const row = db.prepare("SELECT study_session_id FROM focus_sessions WHERE id = ?").get(id) as { study_session_id: number | null } | undefined;
  if (!row) return;
  const m = Math.round(minutes);
  if (m < 1) {
    db.prepare("DELETE FROM focus_sessions WHERE id = ?").run(id);
    return;
  }
  db.prepare("UPDATE focus_sessions SET ended_at = ?, minutes = ?, phase = NULL, ends_at = NULL WHERE id = ?").run(now, m, id);
  if (markDone && row.study_session_id) db.prepare("UPDATE study_sessions SET done = 1 WHERE id = ?").run(row.study_session_id);
}

export function cancelFocus(db: DB, id: number): void {
  db.prepare("DELETE FROM focus_sessions WHERE id = ? AND ended_at IS NULL").run(id);
}

export function focusPushMessage(f: { subject: string; phase: FocusPhase }): PushMessage {
  return f.phase === "work"
    ? { title: "⏱ Fokus geschafft", body: `${f.subject}: Zeit für eine Pause.`, url: "/lernen", tag: "focus" }
    : { title: "☕ Pause vorbei", body: `Weiter mit ${f.subject}?`, url: "/lernen", tag: "focus" };
}

/** Aus der Minuten-Schleife: abgelaufene Phasen melden (je Phase einmal) und vergessene Sitzungen schließen. */
export async function runFocusPushes(db: DB, now: number, send?: Sender): Promise<number> {
  db.prepare("UPDATE focus_sessions SET ended_at = ?, phase = NULL, ends_at = NULL WHERE ended_at IS NULL AND started_at < ?").run(now, now - STALE_MS);
  const due = db
    .prepare("SELECT id, subject, phase FROM focus_sessions WHERE ended_at IS NULL AND notified = 0 AND ends_at IS NOT NULL AND ends_at <= ?")
    .all(now) as { id: number; subject: string; phase: FocusPhase }[];
  if (!due.length) return 0;
  const mark = db.prepare("UPDATE focus_sessions SET notified = 1 WHERE id = ?");
  for (const f of due) mark.run(f.id);
  if (!countSubscriptions(db)) return 0;
  let sent = 0;
  for (const f of due) sent += (await sendToAll(db, focusPushMessage(f), send)).sent;
  return sent;
}

/** Fokussierte Minuten pro Fach in [from, to). */
export function focusMinutesBySubject(db: DB, from: number, to: number): Map<string, number> {
  const rows = db
    .prepare("SELECT subject, SUM(minutes) AS minutes FROM focus_sessions WHERE started_at >= ? AND started_at < ? GROUP BY lower(trim(subject))")
    .all(from, to) as { subject: string; minutes: number }[];
  return new Map(rows.map((r) => [r.subject, r.minutes]));
}

/** Gemessene Minuten für ein Fach seit `from` (ms) – z. B. seit Erstellung eines Lernplans. */
export function focusMinutesFor(db: DB, subject: string, from: number): number {
  const r = db.prepare("SELECT COALESCE(SUM(minutes), 0) AS m FROM focus_sessions WHERE lower(trim(subject)) = lower(trim(?)) AND started_at >= ?").get(subject, from) as { m: number };
  return r.m;
}

/** Fächer für die Auswahl im Timer: aus Lernplänen, Karteikarten und früheren Sitzungen. */
export function knownSubjects(db: DB): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM (
         SELECT title AS name, created_at AS t FROM study_plans WHERE archived = 0
         UNION ALL SELECT subject, created_at FROM flashcard_decks WHERE subject IS NOT NULL
         UNION ALL SELECT subject, started_at FROM focus_sessions
       ) GROUP BY lower(trim(name)) ORDER BY MAX(t) DESC LIMIT 20`,
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}
