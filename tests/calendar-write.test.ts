import { describe, expect, it } from "vitest";
import { eventBody, eventEnd } from "@/integrations/google";

const TZ = "Europe/Berlin";

describe("Termin anlegen", () => {
  it("Ende: fehlt → 1 Stunde, davor → Folgetag", () => {
    expect(eventEnd("2026-10-12", "15:00", null)).toEqual({ day: "2026-10-12", time: "16:00" });
    expect(eventEnd("2026-10-12", "15:00", "15:00")).toEqual({ day: "2026-10-12", time: "16:00" });
    expect(eventEnd("2026-10-12", "15:00", "17:30")).toEqual({ day: "2026-10-12", time: "17:30" });
    expect(eventEnd("2026-10-12", "22:00", "01:00")).toEqual({ day: "2026-10-13", time: "01:00" });
    expect(eventEnd("2026-10-12", "23:30", null)).toEqual({ day: "2026-10-13", time: "00:30" });
  });

  it("mit Uhrzeit: Wanduhrzeit plus Zeitzone", () => {
    expect(eventBody({ title: "Zahnarzt", day: "2026-10-16", start: "08:15", end: "09:00", location: "Praxis", note: null }, TZ)).toMatchObject({
      summary: "Zahnarzt",
      location: "Praxis",
      start: { dateTime: "2026-10-16T08:15:00", timeZone: TZ },
      end: { dateTime: "2026-10-16T09:00:00", timeZone: TZ },
    });
  });

  it("ganztägig: exklusives Enddatum", () => {
    const body = eventBody({ title: "Ausflug", day: "2026-10-16", start: null, end: null }, TZ);
    expect(body).toMatchObject({ start: { date: "2026-10-16" }, end: { date: "2026-10-17" } });
    expect(eventBody({ title: "Ferien", day: "2026-10-19", endDay: "2026-10-30", start: null, end: null }, TZ)).toMatchObject({
      end: { date: "2026-10-31" },
    });
  });
});
