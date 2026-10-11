/** WMO-Wettercodes (Open-Meteo) → deutsche Beschreibung + Icon-Schlüssel. */
export type WeatherIcon = "sun" | "moon" | "cloud-sun" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export function describeWeather(code: number, isDay = true): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: "Klar", icon: isDay ? "sun" : "moon" };
  if (code <= 2) return { label: code === 1 ? "Überwiegend klar" : "Teilweise bewölkt", icon: "cloud-sun" };
  if (code === 3) return { label: "Bedeckt", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Nebel", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Nieselregen", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: code >= 65 || code === 82 ? "Starker Regen" : "Regen", icon: "rain" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Schnee", icon: "snow" };
  if (code >= 95) return { label: "Gewitter", icon: "storm" };
  return { label: "Unbekannt", icon: "cloud" };
}
