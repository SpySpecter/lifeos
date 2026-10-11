import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { listHabits } from "@/lib/habits";
import { healthSeries } from "@/lib/health";
import { lastDays, today } from "@/lib/time";
import { load } from "./core";
import { github } from "./github";
import { google } from "./google";
import { news } from "./news";
import { spotify } from "./spotify";
import { untis } from "./untis";
import { weather, type Coords } from "./weather";

// React `cache` dedupliziert pro Anfrage: mehrere Widgets teilen sich einen Abruf.
export const loadUntis = cache(() => load(untis, undefined));
export const loadGoogle = cache(() => load(google, undefined));
export const loadGitHub = cache(() => load(github, undefined));
export const loadSpotify = cache(() => load(spotify, undefined));
export const loadNews = cache(() => load(news, undefined));

export const LOCATION_COOKIE = "lifeos_loc";

export const loadWeather = cache(async () => {
  const raw = (await cookies()).get(LOCATION_COOKIE)?.value;
  const [lat, lon] = (raw ?? "").split(",").map(Number);
  const coords: Coords =
    Number.isFinite(lat) && Number.isFinite(lon) && raw ? { lat, lon } : { lat: env().DEFAULT_LAT, lon: env().DEFAULT_LON };
  return { located: Boolean(raw), result: await load(weather, coords) };
});

export const currentDay = cache(async () => {
  await connection();
  return today(env().APP_TZ);
});

export const loadHabits = cache(async (historyDays: number = 7) => listHabits(db(), await currentDay(), historyDays));

export const loadHealth = cache(async (days: number) => {
  const range = lastDays(await currentDay(), days);
  return { days: range, series: healthSeries(db(), range) };
});
