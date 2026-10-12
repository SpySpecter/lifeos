import { cn } from "@/lib/utils";

/** Kalender-Heatmap (Wochen als Spalten, Mo–So als Zeilen), sequenzielle Ein-Farb-Skala. */
export function Heatmap({
  cells,
  label,
  unit,
  cell = "size-3",
  className,
}: {
  cells: { day: string; value: number; max?: number }[];
  label: string;
  unit: (v: number) => string;
  cell?: string;
  className?: string;
}) {
  if (!cells.length) return null;
  const peak = Math.max(1, ...cells.map((c) => c.max ?? c.value));
  // Montag als Wochenanfang: führende leere Zellen auffüllen
  const firstWeekday = (new Date(`${cells[0].day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const padded: ({ day: string; value: number; max?: number } | null)[] = [...Array(firstWeekday).fill(null), ...cells];
  const weeks: (typeof padded)[] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const level = (c: { value: number; max?: number }) => {
    if (c.value <= 0) return 0;
    const ratio = c.value / (c.max ?? peak);
    return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
  };

  return (
    <figure className={cn("w-full", className)}>
      <div className="no-scrollbar flex justify-end gap-[3px] overflow-x-auto" role="img" aria-label={label}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, di) => {
              const c = week[di];
              return c ? (
                <span
                  key={di}
                  title={`${new Date(`${c.day}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "UTC" })}: ${unit(c.value)}`}
                  className={cn(cell, "rounded-[3px]")}
                  style={{ background: `var(--seq-${level(c)})` }}
                />
              ) : (
                <span key={di} className={cell} />
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex items-center justify-end gap-1 text-caption2 text-muted-foreground">
        weniger
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="size-2.5 rounded-[3px]" style={{ background: `var(--seq-${l})` }} />
        ))}
        mehr
      </figcaption>
    </figure>
  );
}
