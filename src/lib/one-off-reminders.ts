import "server-only";
import { plainRows, type DB } from "./db";
import { countSubscriptions, sendToAll, type PushMessage, type Sender } from "./push";
import { formatTime } from "./time";

/**
 * Einmalige Erinnerungen („morgen 17 Uhr Mathe lernen“, oder 30 Min. vor einem Termin).
 * Die Minuten-Schleife schickt sie als Push; verpasste werden wie bei den Habits höchstens 3 Stunden später nachgeholt.
 */

export const CATCH_UP_MS = 3 * 60 * 60_000;

export type ReminderStatus = "offen" | "gesendet" | "verpasst" | "erledigt";
export type Reminder = {
  id: number;
  title: string;
  note: string | null;
  dueAt: number;
  url: string | null;
  source: "manuell" | "termin";
  status: ReminderStatus;
};

const SELECT = "SELECT id, title, note, due_at AS dueAt, url, source, status FROM reminders";

export function createReminder(
  db: DB,
  r: { title: string; note?: string | null; dueAt: number; url?: string | null; source?: Reminder["source"] },
  now = Date.now(),
): number {
  const res = db
    .prepare("INSERT INTO reminders (title, note, due_at, url, source, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(r.title.trim(), r.note?.trim() || null, r.dueAt, r.url ?? null, r.source ?? "manuell", now);
  return Number(res.lastInsertRowid);
}

/** Für „Heute“: alles Anstehende plus Gesendetes/Verpasstes der letzten 24 Stunden, das noch nicht abgehakt ist. */
export function listReminders(db: DB, now = Date.now()): Reminder[] {
  return plainRows<Reminder>(
    db.prepare(`${SELECT} WHERE status = 'offen' OR (status IN ('gesendet', 'verpasst') AND due_at >= ?) ORDER BY due_at`).all(now - 86_400_000),
  );
}

export function completeReminder(db: DB, id: number): void {
  db.prepare("UPDATE reminders SET status = 'erledigt' WHERE id = ?").run(id);
}

export function deleteReminder(db: DB, id: number): void {
  db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
}

export function dueReminders(db: DB, now: number): Reminder[] {
  return plainRows<Reminder>(db.prepare(`${SELECT} WHERE status = 'offen' AND due_at <= ? ORDER BY due_at`).all(now));
}

export function oneOffMessage(r: Pick<Reminder, "id" | "title" | "note" | "dueAt" | "url">, tz?: string): PushMessage {
  return {
    title: `⏰ ${r.title}`,
    body: r.note || `Erinnerung für ${formatTime(new Date(r.dueAt), tz)} Uhr`,
    url: r.url || "/",
    tag: `reminder-${r.id}`,
  };
}

export async function runOneOffReminders(
  db: DB,
  now: Date,
  tz: string,
  send?: Sender,
): Promise<{ due: number; sent: number; missed: number }> {
  const due = dueReminders(db, now.getTime());
  const late = due.filter((r) => now.getTime() - r.dueAt > CATCH_UP_MS);
  for (const r of late) db.prepare("UPDATE reminders SET status = 'verpasst' WHERE id = ?").run(r.id);
  const fresh = due.filter((r) => now.getTime() - r.dueAt <= CATCH_UP_MS);
  // Ohne Gerät bleibt die Erinnerung offen – sie steht trotzdem auf „Heute“ und kommt, sobald Push eingerichtet ist
  if (!fresh.length || countSubscriptions(db) === 0) return { due: fresh.length, sent: 0, missed: late.length };
  let sent = 0;
  for (const r of fresh) {
    // Vor dem Senden markieren: lieber eine Erinnerung verlieren als sie minütlich zu wiederholen
    db.prepare("UPDATE reminders SET status = 'gesendet', sent_at = ? WHERE id = ?").run(now.getTime(), r.id);
    const res = await sendToAll(db, oneOffMessage(r, tz), send);
    sent += res.sent;
    if (res.failed) console.warn(`[reminders] ${r.title}: ${res.failed} fehlgeschlagen (${res.errors.join(", ")})`);
  }
  db.prepare("DELETE FROM reminders WHERE status IN ('erledigt', 'gesendet', 'verpasst') AND due_at < ?").run(now.getTime() - 30 * 86_400_000);
  return { due: fresh.length, sent, missed: late.length };
}
