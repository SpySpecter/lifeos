"use client";

import { Check, Flame } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toggleHabitAction } from "@/app/actions";
import type { Habit } from "@/lib/habits";
import { cn } from "@/lib/utils";

export function HabitList({ habits, compact = false }: { habits: Habit[]; compact?: boolean }) {
  const [, start] = useTransition();
  const [optimistic, toggle] = useOptimistic(habits, (state, id: number) =>
    state.map((h) =>
      h.id === id
        ? {
            ...h,
            doneToday: !h.doneToday,
            streak: h.doneToday ? Math.max(0, h.streak - 1) : h.streak + 1,
            history: h.history.map((d, i) => (i === h.history.length - 1 ? { ...d, done: !h.doneToday } : d)),
          }
        : h,
    ),
  );

  return (
    <ul className="space-y-1">
      {optimistic.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() =>
              start(async () => {
                toggle(h.id);
                await toggleHabitAction(h.id);
              })
            }
            aria-pressed={h.doneToday}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/70"
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md ring-1 transition-colors",
                h.doneToday ? "bg-good text-white ring-good" : "ring-foreground/20",
              )}
            >
              {h.doneToday ? <Check className="size-4" aria-hidden /> : null}
            </span>
            <span className="text-base leading-none" aria-hidden>
              {h.emoji}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", h.doneToday && "text-muted-foreground")}>{h.name}</span>
            {!compact ? (
              <span className="hidden gap-0.5 sm:flex" aria-label="Letzte 7 Tage">
                {h.history.map((d) => (
                  <span
                    key={d.day}
                    title={d.day}
                    className={cn("size-2 rounded-[2px]", d.done ? "bg-good" : "bg-foreground/10")}
                  />
                ))}
              </span>
            ) : null}
            <span
              className="flex w-10 items-center justify-end gap-0.5 text-xs text-muted-foreground tabular-nums"
              title={`${h.streak} Tage in Folge`}
            >
              {h.streak > 0 ? (
                <>
                  <Flame className={cn("size-3.5", h.streak >= 7 && "text-series-2")} aria-hidden />
                  {h.streak}
                </>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
