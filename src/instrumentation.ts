/** Wird einmal beim Serverstart aufgerufen: startet die Habit-Erinnerungen (nicht im Build und nicht im Demo-Modus). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { env, isDemo } = await import("./lib/env");
  if (isDemo()) return;
  const [{ db }, { startReminderLoop }] = await Promise.all([import("./lib/db"), import("./lib/reminders")]);
  startReminderLoop(db, env().APP_TZ);
}
