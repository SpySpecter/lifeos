"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; label: string; value: number | null };

function ChartTooltip({ active, payload, unit, digits }: { active?: boolean; payload?: { payload: Point }[]; unit: string; digits: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[12px] bg-popover px-2.5 py-1.5 text-footnote text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <p className="text-muted-foreground">{new Date(`${p.day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</p>
      <p className="font-medium tabular-nums">
        {p.value === null ? "kein Wert" : `${p.value.toLocaleString("de-DE", { maximumFractionDigits: digits })} ${unit}`}
      </p>
    </div>
  );
}

/** Ein Messwert pro Diagramm (keine zweite Y-Achse); Ziel als dezente Referenzlinie. */
export function HealthChart({
  data,
  kind,
  unit,
  digits,
  goal,
  domain,
}: {
  data: Point[];
  kind: "bar" | "line";
  unit: string;
  digits: number;
  goal: number | null;
  domain?: [number, number];
}) {
  const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
      <YAxis {...axis} width={44} domain={domain ?? [0, "auto"]} allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString("de-DE", { notation: "compact" })} />
      <Tooltip
        cursor={{ fill: "var(--muted)", opacity: 0.6, stroke: "var(--muted-foreground)" }}
        content={<ChartTooltip unit={unit} digits={digits} />}
      />
      {goal ? <ReferenceLine y={goal} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Ziel", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} /> : null}
    </>
  );
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
            {common}
            <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            <Line
              dataKey="value"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
