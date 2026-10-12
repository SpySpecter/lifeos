import { describe, expect, it } from "vitest";
import {
  CATCH_UP_MS,
  completeReminder,
  createReminder,
  deleteReminder,
  listReminders,
  oneOffMessage,
  runOneOffReminders,
} from "@/lib/one-off-reminders";
import { saveSubscription, type Sender } from "@/lib/push";
import { normalizeQuickEntry, type QuickEntry } from "@/lib/quick-entry";
import { zonedToEpoch } from "@/lib/time";
import { memoryDb } from "./support/db";

const TZ = "Europe/Berlin";
const APPLE = "https://web.push.apple.com/QGx1ZWJvcm4";
const sub = () => ({ endpoint: APPLE, keys: { p256dh: "BPkey", auth: "authkey" } });
const at = (hhmm: string, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+02:00`);

function recorder() {
  const calls: { title: string; body: string; url: string; tag?: string }[] = [];
  const send: Sender = async (_s, payload) => {
    calls.push(JSON.parse(payload));
  };
  return { calls, send };
}

function withDevice() {
  const db = memoryDb();
  saveSubscription(db, sub(), "iPhone");
  return db;
}

describe("Einmalige Erinnerungen", () => {
  it("schickt eine fällige Erinnerung genau einmal", async () => {
    const db = withDevice();
    const { calls, send } = recorder();
    createReminder(db, { title: "Mathe lernen", dueAt: at("17:00").getTime() });
    expect((await runOneOffReminders(db, at("16:59"), TZ, send)).sent).toBe(0);
    expect((await runOneOffReminders(db, at("17:00"), TZ, send)).sent).toBe(1);
    expect((await runOneOffReminders(db, at("17:01"), TZ, send)).sent).toBe(0);
    expect(calls).toEqual([{ title: "⏰ Mathe lernen", body: "Erinnerung für 17:00 Uhr", url: "/", tag: expect.stringMatching(/^reminder-\d+$/) }]);
    expect(listReminders(db, at("17:01").getTime())[0].status).toBe("gesendet");
  });

  it("holt bis 3 Stunden nach, danach gilt sie als verpasst", async () => {
    const db = withDevice();
    const { calls, send } = recorder();
    createReminder(db, { title: "Spät", dueAt: at("12:00").getTime() });
    createReminder(db, { title: "Zu spät", dueAt: at("12:00").getTime() - CATCH_UP_MS - 60_000 });
    const res = await runOneOffReminders(db, at("12:00"), TZ, send);
    expect(res).toEqual({ due: 1, sent: 1, missed: 1 });
    expect(calls.map((c) => c.title)).toEqual(["⏰ Spät"]);
    expect(listReminders(db, at("12:00").getTime()).find((r) => r.title === "Zu spät")?.status).toBe("verpasst");
  });

  it("wartet ohne Gerät, statt die Erinnerung zu verbrauchen", async () => {
    const db = memoryDb();
    const { send } = recorder();
    createReminder(db, { title: "Ohne Push", dueAt: at("09:00").getTime() });
    expect((await runOneOffReminders(db, at("09:00"), TZ, send)).sent).toBe(0);
    expect(listReminders(db, at("09:00").getTime())[0].status).toBe("offen");
  });

  it("sendet erledigte und gelöschte nicht und blendet sie aus", async () => {
    const db = withDevice();
    const { calls, send } = recorder();
    const a = createReminder(db, { title: "A", dueAt: at("10:00").getTime() });
    const b = createReminder(db, { title: "B", dueAt: at("10:00").getTime() });
    completeReminder(db, a);
    deleteReminder(db, b);
    await runOneOffReminders(db, at("10:00"), TZ, send);
    expect(calls).toEqual([]);
    expect(listReminders(db, at("10:00").getTime())).toEqual([]);
  });

  it("öffnet bei Termin-Erinnerungen den Kalender-Link und zeigt die Notiz", () => {
    const msg = oneOffMessage({ id: 7, title: "Zahnarzt", note: "15:00–16:00 Uhr · Praxis", dueAt: 0, url: "https://calendar.google.com/x" });
    expect(msg).toEqual({ title: "⏰ Zahnarzt", body: "15:00–16:00 Uhr · Praxis", url: "https://calendar.google.com/x", tag: "reminder-7" });
  });
});

describe("zonedToEpoch", () => {
  it("rechnet Berliner Wanduhrzeit in Sommer- und Winterzeit um", () => {
    expect(new Date(zonedToEpoch("2026-10-12", "17:00", TZ)).toISOString()).toBe("2026-10-12T15:00:00.000Z");
    expect(new Date(zonedToEpoch("2026-12-24", "17:00", TZ)).toISOString()).toBe("2026-12-24T16:00:00.000Z");
  });
  it("stimmt rund um die Umstellung am 25.10.2026", () => {
    expect(new Date(zonedToEpoch("2026-10-24", "23:30", TZ)).toISOString()).toBe("2026-10-24T21:30:00.000Z");
    expect(new Date(zonedToEpoch("2026-10-25", "09:00", TZ)).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    // 30 Minuten vor einem Termin am Umstellungstag
    expect(zonedToEpoch("2026-10-25", "09:00", TZ) - zonedToEpoch("2026-10-25", "08:30", TZ)).toBe(30 * 60_000);
  });
});

describe("Schnelleingabe", () => {
  const now = at("18:30");
  const raw = (patch: Partial<QuickEntry>): QuickEntry => ({
    kind: "erinnerung",
    title: "Mathe lernen",
    date: "2026-10-13",
    time: "17:00",
    endTime: null,
    allDay: false,
    location: null,
    remindBefore: 0,
    ...patch,
  });

  it("übernimmt eine gültige Erinnerung unverändert", () => {
    expect(normalizeQuickEntry(raw({}), now, TZ)).toEqual(raw({}));
  });
  it("setzt fehlende Uhrzeit auf 9 Uhr und verschiebt Vergangenes", () => {
    expect(normalizeQuickEntry(raw({ date: "2026-10-12", time: null }), now, TZ)).toMatchObject({ date: "2026-10-13", time: "09:00" });
    expect(normalizeQuickEntry(raw({ date: "2026-10-12", time: "17:00" }), now, TZ).date).toBe("2026-10-13");
    expect(normalizeQuickEntry(raw({ date: "2026-10-12", time: "20:00" }), now, TZ).date).toBe("2026-10-12");
    expect(normalizeQuickEntry(raw({ date: "2025-01-01" }), now, TZ).date).toBe("2026-10-13");
    expect(normalizeQuickEntry(raw({ date: "kaputt" }), now, TZ).date).toBe("2026-10-13");
  });
  it("Termine: ganztägig ohne Uhrzeit, Ende nur mit Start, Ort und Vorlauf bleiben", () => {
    expect(normalizeQuickEntry(raw({ kind: "termin", time: null, endTime: "10:00", location: " Praxis ", remindBefore: 1440 }), now, TZ)).toMatchObject({
      allDay: true,
      time: null,
      endTime: null,
      location: "Praxis",
      remindBefore: 1440,
    });
    expect(normalizeQuickEntry(raw({ kind: "termin", time: "08:15", endTime: "09:00", remindBefore: 45 as never }), now, TZ)).toMatchObject({
      allDay: false,
      endTime: "09:00",
      remindBefore: 0,
    });
  });
  it("Erinnerungen haben weder Ort noch Vorlauf, leerer Titel bekommt einen Standard", () => {
    expect(normalizeQuickEntry(raw({ location: "Schule", remindBefore: 30, title: "  " }), now, TZ)).toMatchObject({
      location: null,
      remindBefore: 0,
      title: "Erinnerung",
    });
  });
});
