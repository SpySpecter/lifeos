/** Datumshilfen. Tage werden überall als `YYYY-MM-DD` in der Zeitzone des Nutzers geführt. */

export const DEFAULT_TZ = "Europe/Berlin";

export function dayString(date: Date, tz: string = DEFAULT_TZ): string {
  // sv-SE formatiert als YYYY-MM-DD
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function today(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return dayString(now, tz);
}

/** Tag und Uhrzeit 'HH:MM' (24 h) in der Zeitzone des Nutzers – für minütliche Zeitpläne. */
export function localClock(now: Date, tz: string): { day: string; hhmm: string } {
  const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(now);
  return { day: dayString(now, tz), hhmm };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Liste der letzten `n` Tage bis einschließlich `end`, älteste zuerst. */
export function lastDays(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function weekdayShort(day: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function formatDayLong(day: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

export function formatTime(date: Date | string, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(date));
}

export function relativeTime(date: Date | string | number, now: Date = new Date()): string {
  const diff = (new Date(date).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function greeting(now: Date = new Date(), tz: string = DEFAULT_TZ): string {
  // en-GB liefert die nackte Stunde ("19"); de-DE würde "19 Uhr" formatieren
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(now));
  if (hour < 5) return "Gute Nacht";
  if (hour < 11) return "Guten Morgen";
  if (hour < 17) return "Hallo";
  if (hour < 22) return "Guten Abend";
  return "Gute Nacht";
}
