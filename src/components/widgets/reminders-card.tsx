import { currentDay } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { listReminders } from "@/lib/one-off-reminders";
import { addDays, dayString, formatTime } from "@/lib/time";
import { ReminderList, type ReminderRow } from "../reminder-list";

function when(dueAt: number, day: string, tz: string): string {
  const d = new Date(dueAt);
  const due = dayString(d, tz);
  const time = `${formatTime(d, tz)} Uhr`;
  if (due === day) return `Heute, ${time}`;
  if (due === addDays(day, 1)) return `Morgen, ${time}`;
  if (due === addDays(day, -1)) return `Gestern, ${time}`;
  const date = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
  return `${date}, ${time}`;
}

/** Offene und gerade fällige einmalige Erinnerungen; ohne Einträge unsichtbar. */
export async function RemindersCard() {
  const day = await currentDay();
  const tz = env().APP_TZ;
  const rows: ReminderRow[] = listReminders(db()).map((r) => ({ ...r, when: when(r.dueAt, day, tz) }));
  return <ReminderList rows={rows} />;
}
