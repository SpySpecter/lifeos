import { z } from "zod";
import type { DB } from "./db";

export const METRICS = {
  steps: { label: "Schritte", unit: "", digits: 0, goal: 8000, max: 200_000 },
  sleep: { label: "Schlaf", unit: "h", digits: 1, goal: 8, max: 24 },
  workout: { label: "Training", unit: "min", digits: 0, goal: 30, max: 1440 },
  energy: { label: "Aktivkalorien", unit: "kcal", digits: 0, goal: 500, max: 20_000 },
  heart: { label: "Ruhepuls", unit: "bpm", digits: 0, goal: null, max: 250 },
  mood: { label: "Stimmung", unit: "/5", digits: 0, goal: null, max: 5 },
} as const;

export type Metric = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as Metric[];

/**
 * Zahlen aus iPhone-Kurzbefehlen kommen je nach Gerätesprache als "7,5", "7.5", "8.432" oder als Liste.
 * Listen werden summiert (z. B. mehrere Schritt-Proben eines Tages).
 */
export function parseLooseNumber(input: unknown): number | undefined {
  if (input === null || input === undefined || input === "") return undefined;
  if (Array.isArray(input)) {
    const parts = input.map(parseLooseNumber).filter((n): n is number => n !== undefined);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
  }
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string") return undefined;
  let s = input.trim().replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, ""); // 8.432 oder 8.432,5 (deutsch)
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const loose = z.unknown().transform(parseLooseNumber).optional();

export const ingestSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    steps: loose,
    sleep: loose,
    workout: loose,
    energy: loose,
    heart: loose,
    mood: loose,
  })
  .strict();

export type HealthValues = Partial<Record<Metric, number>>;

export function validateValues(values: HealthValues): HealthValues {
  const out: HealthValues = {};
  for (const key of METRIC_KEYS) {
    const v = values[key];
    if (v === undefined) continue;
    if (v < 0 || v > METRICS[key].max) throw new Error(`${METRICS[key].label}: Wert ${v} außerhalb des gültigen Bereichs`);
    out[key] = v;
  }
  return out;
}

export function upsertHealth(db: DB, day: string, values: HealthValues, source: "shortcut" | "manual" | "demo"): number {
  const stmt = db.prepare(
    "INSERT INTO health (day, metric, value, source, updated_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at",
  );
  let n = 0;
  for (const [metric, value] of Object.entries(validateValues(values))) {
    stmt.run(day, metric, value, source, Date.now());
    n++;
  }
  return n;
}

export type HealthSeries = Record<Metric, (number | null)[]>;

export function healthSeries(db: DB, days: string[]): HealthSeries {
  const rows = db
    .prepare("SELECT day, metric, value FROM health WHERE day >= ? AND day <= ?")
    .all(days[0], days[days.length - 1]) as { day: string; metric: Metric; value: number }[];
  const index = new Map(days.map((d, i) => [d, i]));
  const series = Object.fromEntries(METRIC_KEYS.map((k) => [k, days.map(() => null)])) as HealthSeries;
  for (const r of rows) {
    const i = index.get(r.day);
    if (i !== undefined && r.metric in series) series[r.metric][i] = r.value;
  }
  return series;
}

export function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
