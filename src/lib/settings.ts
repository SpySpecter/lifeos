import type { DB } from "./db";
import { METRICS } from "./health";

/** Einstellungen, die im Dashboard änderbar sind (Schlüssel-Wert-Tabelle, Werte als JSON). */
export type Settings = {
  displayName: string;
  defaultPlace: { name: string; lat: number; lon: number } | null;
  goals: { steps: number; sleep: number; workout: number; energy: number };
  mailProfile: string;
};

export const DEFAULT_MAIL_PROFILE = `Ich bin Schüler in der Oberstufe (Brandenburg, LK Informatik) und programmiere viel (GitHub, KI-Tools, eigener VPS).
Wichtig (immer im Posteingang lassen): Schule, Lehrer, Untis, Behörden, Bank/Rechnungen/Bestellungen, Sicherheitswarnungen meiner Konten (neues Gerät, Passwort, 2FA), Bewerbungen, persönliche Mails von echten Menschen.
Archivieren statt löschen: GitHub/Entwickler-Benachrichtigungen, Versandbestätigungen, Newsletter, die ich manchmal lese.
Löschen: Werbung, Rabattaktionen, Gewinnspiele, Social-Media-Benachrichtigungen, Newsletter, die ich nie lese, offensichtlicher Spam.`;

export function defaultSettings(): Settings {
  return {
    displayName: "",
    defaultPlace: null,
    goals: {
      steps: METRICS.steps.goal,
      sleep: METRICS.sleep.goal,
      workout: METRICS.workout.goal,
      energy: METRICS.energy.goal,
    },
    mailProfile: DEFAULT_MAIL_PROFILE,
  };
}

export function getSettings(db: DB): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: keyof Settings; value: string }[];
  const s = defaultSettings();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      if (r.key === "goals") s.goals = { ...s.goals, ...v };
      else if (r.key in s) (s as Record<string, unknown>)[r.key] = v;
    } catch {
      /* ungültigen Eintrag ignorieren */
    }
  }
  return s;
}

export function setSetting<K extends keyof Settings>(db: DB, key: K, value: Settings[K]): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value),
  );
}
