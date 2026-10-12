import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HealthChart } from "@/components/health-chart";
import { HealthForm } from "@/components/health-form";
import { SettingsLink } from "@/components/nav";
import { PageHeader } from "@/components/page-header";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
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
      {/* Segmentierte Auswahl wie in Health (Links, damit der Zeitraum in der URL steht) */}
      <nav className="grid max-w-sm grid-cols-3 rounded-[9px] bg-muted p-[2px]" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/health?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(
              "flex min-h-8 items-center justify-center rounded-[7px] text-footnote font-medium text-foreground/80",
              r === range && "bg-card text-foreground shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] dark:bg-elevated",
            )}
          >
            {r} Tage
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {METRIC_KEYS.map((k) => {
          const m = METRICS[k];
          const avg = average(series[k]);
          const data = days.map((d, i) => ({
            day: d,
            label: new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", timeZone: "UTC" }),
            value: series[k][i],
          }));
          return (
            <section key={k} className="rounded-[20px] bg-card p-4">
              <header className="mb-3">
                <h2 className="flex items-center gap-1.5 text-subhead font-semibold" style={{ color: "var(--cat-health)" }}>
                  {m.label}
                </h2>
                <p className="mt-1 text-footnote text-muted-foreground">Durchschnitt · {range} Tage</p>
                <p className="font-heading text-title1 font-bold tracking-tight tabular-nums">
                  {avg === null ? "–" : avg.toLocaleString("de-DE", { maximumFractionDigits: m.digits === 0 ? 0 : 1 })}
                  <span className="ml-1 text-subhead font-semibold text-muted-foreground">{m.unit.replace(/^\//, "von ")}</span>
                </p>
              </header>
              <HealthChart data={data} kind={KIND[k]} unit={m.unit} digits={m.digits} goal={goalFor(k)} domain={k === "mood" ? [1, 5] : undefined} />
              <details className="mt-2 text-footnote text-muted-foreground">
                <summary className="flex min-h-11 cursor-pointer items-center text-tint-text select-none">Als Tabelle</summary>
                <table className="mt-2 w-full tabular-nums">
                  <tbody>
                    {data
                      .filter((p) => p.value !== null)
                      .reverse()
                      .slice(0, 14)
                      .map((p) => (
                        <tr key={p.day} className="border-t border-border">
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

      <WidgetCard title="Werte eintragen" footer="Leere Felder bleiben unverändert. Automatisch geht es mit dem iPhone-Kurzbefehl (siehe Einstellungen).">
        <HealthForm today={today} />
      </WidgetCard>
    </div>
  );
}

export default function HealthPage(props: PageProps<"/health">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Gesundheit" trailing={<SettingsLink className="desktop:hidden" />} />
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <Charts searchParams={props.searchParams as Promise<{ range?: string }>} />
      </Suspense>
    </div>
  );
}
