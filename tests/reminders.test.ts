import { describe, expect, it } from "vitest";
import { isSingleEmoji, suggestEmoji } from "@/lib/emoji";
import { addHabit, listHabits, toggleHabit, updateHabit } from "@/lib/habits";
import { countSubscriptions, isPushEndpoint, saveSubscription, sendToAll, vapidKeys, type Sender } from "@/lib/push";
import { dueHabits, localClock, reminderMessage, runReminders } from "@/lib/reminders";
import { memoryDb } from "./support/db";

const TZ = "Europe/Berlin";
const APPLE = "https://web.push.apple.com/QGx1ZWJvcm4";
const sub = (endpoint = APPLE) => ({ endpoint, keys: { p256dh: "BPkey", auth: "authkey" } });
// 2026-10-12 21:00 in Berlin (Sommerzeit, UTC+2)
const at = (hhmm: string, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+02:00`);

function recorder(fail?: (endpoint: string) => number | null) {
  const calls: { endpoint: string; payload: { title: string; body: string; url: string; tag?: string } }[] = [];
  const send: Sender = async (s, payload) => {
    const status = fail?.(s.endpoint);
    if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
    calls.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
  };
  return { calls, send };
}

describe("Emoji", () => {
  it("schlägt aus dem Namen ein Emoji vor", () => {
    expect(suggestEmoji("2 Liter Wasser trinken")).toBe("💧");
    expect(suggestEmoji("10 Seiten lesen")).toBe("📚");
    expect(suggestEmoji("Gitarre üben")).toBe("🎸");
    expect(suggestEmoji("Klavier")).toBe("🎹");
    expect(suggestEmoji("üben")).toBe("🎧"); // Umlaut am Wortanfang
    expect(suggestEmoji("Vokabeln Englisch")).toBe("🗣️");
    expect(suggestEmoji("Gym")).toBe("💪");
    expect(suggestEmoji("xyz")).toBeNull();
  });
  it("erkennt genau ein Emoji, auch zusammengesetzte", () => {
    for (const e of ["✅", "💧", "✍️", "❤️", "👍🏽", "🧑‍💻", "🇩🇪"]) expect(isSingleEmoji(e), e).toBe(true);
    for (const e of ["", "a", "💧💧", "ok", "1"]) expect(isSingleEmoji(e), e).toBe(false);
  });
});

describe("Push", () => {
  it("akzeptiert nur bekannte Push-Dienste über https", () => {
    expect(isPushEndpoint(APPLE)).toBe(true);
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isPushEndpoint("https://evil.example/web.push.apple.com")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(() => saveSubscription(memoryDb(), sub("https://evil.example/x"), null)).toThrow();
  });

  it("erzeugt das VAPID-Schlüsselpaar einmal und behält es", () => {
    const db = memoryDb();
    const a = vapidKeys(db);
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(vapidKeys(db)).toEqual(a);
  });

  it("entfernt abgelaufene Abos (410) und zählt Fehler", async () => {
    const db = memoryDb();
    saveSubscription(db, sub(), "iPhone");
    saveSubscription(db, sub("https://fcm.googleapis.com/fcm/send/old"), "Android");
    saveSubscription(db, sub("https://updates.push.services.mozilla.com/broken"), "Firefox");
    const { calls, send } = recorder((e) => (e.includes("old") ? 410 : e.includes("broken") ? 500 : null));
    const r = await sendToAll(db, { title: "t", body: "b", url: "/" }, send);
    expect(r).toMatchObject({ sent: 1, removed: 1, failed: 1, errors: ["HTTP 500"] });
    expect(calls.map((c) => c.endpoint)).toEqual([APPLE]);
    expect(countSubscriptions(db)).toBe(2);
  });
});

describe("Erinnerungen", () => {
  it("liest die Uhrzeit in der Zeitzone", () => {
    expect(localClock(at("21:00"), TZ)).toEqual({ day: "2026-10-12", hhmm: "21:00" });
  });

  it("erinnert nur an offene Gewohnheiten, deren Uhrzeit erreicht ist", () => {
    const db = memoryDb();
    const water = addHabit(db, "Wasser", "💧", "21:00");
    const read = addHabit(db, "Lesen", "📚", "21:30");
    const gym = addHabit(db, "Gym", "💪", "20:00");
    addHabit(db, "Ohne Uhrzeit", "✅");
    toggleHabit(db, gym, "2026-10-12");
    expect(dueHabits(db, "2026-10-12", "21:00").map((h) => h.id)).toEqual([water]);
    expect(dueHabits(db, "2026-10-12", "21:45").map((h) => h.id)).toEqual([water, read]);
  });

  it("holt verpasste Erinnerungen höchstens 3 Stunden nach", () => {
    const db = memoryDb();
    addHabit(db, "Morgens", "🌅", "07:00");
    expect(dueHabits(db, "2026-10-12", "09:59")).toHaveLength(1);
    expect(dueHabits(db, "2026-10-12", "10:01")).toHaveLength(0);
  });

  it("sendet pro Gewohnheit und Tag genau eine Mitteilung", async () => {
    const db = memoryDb();
    const id = addHabit(db, "Wasser trinken", "💧", "21:00");
    for (const d of ["2026-10-10", "2026-10-11"]) toggleHabit(db, id, d);
    saveSubscription(db, sub(), "iPhone");
    const { calls, send } = recorder();

    expect(await runReminders(db, at("20:59"), TZ, send)).toEqual({ habits: 0, sent: 0 });
    expect(await runReminders(db, at("21:00"), TZ, send)).toEqual({ habits: 1, sent: 1 });
    expect(await runReminders(db, at("21:01"), TZ, send)).toEqual({ habits: 0, sent: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({
      title: "💧 Wasser trinken",
      body: "Noch offen – halte deine Serie von 2 Tagen.",
      url: "/habits",
      tag: `habit-${id}`,
    });
    // Am nächsten Tag wieder
    expect(await runReminders(db, at("21:00", "2026-10-13"), TZ, send)).toMatchObject({ sent: 1 });
  });

  it("sendet nichts ohne registriertes Gerät und merkt sich dann auch nichts", async () => {
    const db = memoryDb();
    addHabit(db, "Wasser", "💧", "21:00");
    const { calls, send } = recorder();
    expect(await runReminders(db, at("21:00"), TZ, send)).toEqual({ habits: 0, sent: 0 });
    saveSubscription(db, sub(), "iPhone");
    expect(await runReminders(db, at("21:05"), TZ, send)).toEqual({ habits: 1, sent: 1 });
    expect(calls).toHaveLength(1);
  });

  it("eine geänderte Uhrzeit erlaubt heute eine neue Erinnerung, eine Umbenennung nicht", async () => {
    const db = memoryDb();
    const id = addHabit(db, "Wasser", "💧", "21:00");
    saveSubscription(db, sub(), "iPhone");
    const { send } = recorder();
    await runReminders(db, at("21:00"), TZ, send);
    updateHabit(db, id, { name: "Wasser trinken", emoji: "🥤", remindAt: "21:00" });
    expect(dueHabits(db, "2026-10-12", "21:10")).toHaveLength(0);
    updateHabit(db, id, { name: "Wasser trinken", emoji: "🥤", remindAt: "21:10" });
    expect(dueHabits(db, "2026-10-12", "21:10")).toHaveLength(1);
    expect(listHabits(db, "2026-10-12")[0]).toMatchObject({ name: "Wasser trinken", emoji: "🥤", remindAt: "21:10" });
  });

  it("formuliert ohne Serie schlicht", () => {
    expect(reminderMessage({ id: 1, name: "Lesen", emoji: "📚", streak: 0 }).body).toBe("Heute noch nicht abgehakt.");
  });
});
