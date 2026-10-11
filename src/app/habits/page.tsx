import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchiveHabitButton } from "@/components/archive-habit-button";
import { HabitForm } from "@/components/habit-form";
import { HabitList } from "@/components/habit-list";
import { Heatmap } from "@/components/heatmap";
import { WidgetSkeleton } from "@/components/widget-card";
import { currentDay, loadHabits } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { habitHeatmap } from "@/lib/habits";

export const metadata: Metadata = { title: "Gewohnheiten" };

async function HabitsContent() {
  const [habits, day] = await Promise.all([loadHabits(30), currentDay()]);
  const heat = habitHeatmap(db(), day, 16 * 7);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
        <h2 className="mb-3 font-medium">Heute</h2>
        {habits.length ? <HabitList habits={habits.map((h) => ({ ...h, history: h.history.slice(-7) }))} /> : <p className="text-sm text-muted-foreground">Noch keine Gewohnheiten.</p>}
        <div className="mt-5 border-t pt-4">
          <HabitForm />
        </div>
      </section>

      <div className="space-y-4">
        <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
          <h2 className="mb-3 font-medium">Letzte 16 Wochen</h2>
          <Heatmap
            cells={heat.map((h) => ({ day: h.day, value: h.count, max: h.total }))}
            label="Erledigte Gewohnheiten pro Tag, letzte 16 Wochen"
            unit={(v) => `${v} erledigt`}
            cell="size-3 sm:size-4"
          />
        </section>
        <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
          <h2 className="mb-3 font-medium">Quote (30 Tage)</h2>
          <ul className="space-y-3 text-sm">
            {habits.map((h) => {
              const rate = h.history.filter((d) => d.done).length / h.history.length;
              return (
                <li key={h.id} className="flex items-center gap-3">
                  <span aria-hidden>{h.emoji}</span>
                  <span className="w-40 truncate">{h.name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${rate * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-muted-foreground tabular-nums">{Math.round(rate * 100)} %</span>
                  <ArchiveHabitButton id={h.id} name={h.name} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function HabitsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gewohnheiten</h1>
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <HabitsContent />
      </Suspense>
    </div>
  );
}
