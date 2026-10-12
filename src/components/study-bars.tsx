import type { StudyTime } from "@/lib/study";

/** Plan gegen Ist je Fach: graue Spur = geplant, Balken = gemessen (eine Farbe, Zahlen immer dabei). */
export function StudyBars({ rows }: { rows: StudyTime[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.actual)));
  return (
    <ul className="space-y-3" aria-label="Lernzeit pro Fach">
      {rows.map((r) => (
        <li key={r.subject} title={`${r.subject}: ${r.actual} von ${r.planned} Min.`}>
          <div className="flex items-baseline justify-between gap-2 text-subhead">
            <span className="truncate font-medium">{r.subject}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {r.actual} / {r.planned} Min.
            </span>
          </div>
          <div className="relative mt-1 h-2.5">
            <span className="absolute inset-y-0 left-0 rounded-[4px] bg-muted" style={{ width: `${(r.planned / max) * 100}%` }} aria-hidden />
            <span className="absolute inset-y-0 left-0 rounded-[4px] bg-series-1" style={{ width: `${(r.actual / max) * 100}%` }} aria-hidden />
          </div>
        </li>
      ))}
    </ul>
  );
}
