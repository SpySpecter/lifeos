import { describe, expect, it } from "vitest";
import { mapOpenMeteo, roundCoords } from "@/integrations/weather";
import { describeWeather } from "@/lib/weather-codes";

describe("Wetter", () => {
  it("rundet Koordinaten auf ~1 km", () => {
    expect(roundCoords({ lat: 52.520008, lon: 13.404954 })).toEqual({ lat: 52.52, lon: 13.4 });
  });

  it("beginnt die Stundenvorschau bei der aktuellen Stunde", () => {
    const hours = Array.from({ length: 48 }, (_, i) => `2026-10-${11 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`);
    const w = mapOpenMeteo(
      {
        current: { temperature_2m: 10, apparent_temperature: 8, weather_code: 3, wind_speed_10m: 5, is_day: 0 },
        hourly: { time: hours, temperature_2m: hours.map((_, i) => i), precipitation_probability: hours.map(() => 0), weather_code: hours.map(() => 0) },
        daily: { time: ["2026-10-11"], weather_code: [3], temperature_2m_max: [12], temperature_2m_min: [4], precipitation_probability_max: [10], sunrise: ["2026-10-11T07:21"], sunset: ["2026-10-11T18:31"] },
      },
      "Berlin",
      "2026-10-11T19:42",
    );
    expect(w.hourly[0].time).toBe("2026-10-11T19:00");
    expect(w.hourly).toHaveLength(12);
    expect(w.current.isDay).toBe(false);
  });

  it("beschreibt WMO-Codes auf Deutsch", () => {
    expect(describeWeather(0, false)).toEqual({ label: "Klar", icon: "moon" });
    expect(describeWeather(63).label).toBe("Regen");
    expect(describeWeather(95).icon).toBe("storm");
  });
});
