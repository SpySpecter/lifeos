import { HeartPulse } from "lucide-react";
import { loadHealth } from "@/integrations/loaders";
import { METRICS, average, type Metric } from "@/lib/health";
import { weekdayShort } from "@/lib/time";
import { WidgetCard } from "../widget-card";

const fmt = (metric: Metric, v: number | null) =>
  v === null ? "–" : v.toLocaleString("de-DE", { maximumFractionDigits: METRICS[metric].digits });

function Tile({ metric, value, avg }: { metric: Metric; value: number | null; avg: number | null }) {
  const m = METRICS[metric];
  const pct = m.goal && value !== null ? Math.min(100, (value / m.goal) * 100) : null;
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{m.label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">
        {fmt(metric, value)}
        {value !== null && m.unit ? <span className="ml-0.5 text-sm font-normal text-muted-foreground">{m.unit}</span> : null}
      </p>
      {pct !== null ? (
        <div className="mt-2 h-1 rounded-full bg-muted" role="img" aria-label={`${Math.round(pct)} % vom Ziel`}>
          <div className="h-1 rounded-full bg-series-1" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Ø 7 T: {fmt(metric, avg)}</p>
      )}
    </div>
  );
}

export async function HealthWidget({ className }: { className?: string }) {
  const { days, series } = await loadHealth(7);
  const last = days.length - 1;
  const steps = series.steps;
  const maxSteps = Math.max(METRICS.steps.goal, ...steps.map((s) => s ?? 0));
  const hasData = Object.values(series).some((s) => s.some((v) => v !== null));

  return (
    <WidgetCard title="Gesundheit" icon={HeartPulse} href="/health" className={className}>
      {!hasData ? (
        <p className="py-6 text-sm text-muted-foreground">
          Noch keine Werte. Richte den iPhone-Kurzbefehl ein oder trage Werte auf der Gesundheitsseite ein.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(["steps", "sleep", "workout"] as const).map((k) => (
              <Tile key={k} metric={k} value={series[k][last]} avg={average(series[k])} />
            ))}
          </div>
          <figure>
            <figcaption className="mb-2 text-xs text-muted-foreground">Schritte · letzte 7 Tage</figcaption>
            <div className="flex h-20 items-end gap-1.5">
              {steps.map((v, i) => (
                <div key={days[i]} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-t-[4px] bg-series-1 opacity-85 group-hover:opacity-100"
                    style={{ height: `${v ? Math.max(4, (v / maxSteps) * 100) : 0}%` }}
                    title={`${weekdayShort(days[i])}: ${fmt("steps", v)} Schritte`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-[10px] text-muted-foreground">
              {days.map((d, i) => (
                <span key={d} className="flex-1">
                  {i === last ? "Heute" : weekdayShort(d)}
                </span>
              ))}
            </div>
          </figure>
        </div>
      )}
    </WidgetCard>
  );
}
