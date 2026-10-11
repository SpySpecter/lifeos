import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HealthChart } from "@/components/health-chart";
import { HealthForm } from "@/components/health-form";
import { WidgetSkeleton } from "@/components/widget-card";
import { currentDay, loadHealth, loadSettings } from "@/integrations/loaders";
import { METRICS, METRIC_KEYS, average, type Metric } from "@/lib/health";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gesundheit" };

const RANGES = [14, 30, 90] as const;
const KIND: Record<Metric, "bar" | "line"> = { steps: "bar", sleep: "bar", workout: "bar", energy: "bar", heart: "line", mood: "line" };

async function Charts({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const requested = Number((await searchParams).range);
  const range = (RANGES as readonly number[]).includes(requested) ? requested : 30;
  const { days, series } = await loadHealth(range);
  const today = await currentDay();
  const { goals } = await loadSettings();
  const goalFor = (k: Metric) => (k in goals ? goals[k as keyof typeof goals] : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm" role="group" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/health?range=${r}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted",
              r === range && "bg-card text-foreground ring-1 ring-foreground/8",
            )}
          >
            {r} Tage
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {METRIC_KEYS.map((k) => {
          const m = METRICS[k];
          const avg = average(series[k]);
          const data = days.map((d, i) => ({
            day: d,
            label: new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", timeZone: "UTC" }),
            value: series[k][i],
          }));
          return (
            <section key={k} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
              <header className="mb-2 flex items-baseline gap-2">
                <h2 className="font-medium">{m.label}</h2>
                <p className="ml-auto text-sm text-muted-foreground tabular-nums">
                  Ø {avg === null ? "–" : avg.toLocaleString("de-DE", { maximumFractionDigits: m.digits === 0 ? 0 : 1 })}
                  {m.unit.startsWith("/") ? m.unit : ` ${m.unit}`}
                </p>
              </header>
              <HealthChart data={data} kind={KIND[k]} unit={m.unit} digits={m.digits} goal={goalFor(k)} domain={k === "mood" ? [1, 5] : undefined} />
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Als Tabelle</summary>
                <table className="mt-2 w-full tabular-nums">
                  <tbody>
                    {data
                      .filter((p) => p.value !== null)
                      .reverse()
                      .slice(0, 14)
                      .map((p) => (
                        <tr key={p.day} className="border-t">
                          <td className="py-1">{p.day}</td>
                          <td className="py-1 text-right text-foreground">{p.value?.toLocaleString("de-DE")} {m.unit}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </details>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
        <h2 className="mb-1 font-medium">Werte eintragen</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Leere Felder bleiben unverändert. Automatisch geht es mit dem iPhone-Kurzbefehl (siehe Einstellungen).
        </p>
        <HealthForm today={today} />
      </section>
    </div>
  );
}

export default function HealthPage(props: PageProps<"/health">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gesundheit</h1>
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <Charts searchParams={props.searchParams as Promise<{ range?: string }>} />
      </Suspense>
    </div>
  );
}
