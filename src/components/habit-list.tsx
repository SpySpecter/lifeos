"use client";

import { Check, Flame, RotateCcw } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toggleHabitAction } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import type { Habit } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { SwipeRow } from "./ios/swipe-row";

/**
 * Abhakliste wie in Erinnerungen: runder Kreis, Tipp oder Wischen nach rechts hakt ab (mit Haptik).
 * Die Serie steht rechts (Tage, Wochen, Monate); die letzten 7 Tage als Punkte ab sm – bei nicht-täglichen
 * Gewohnheiten gefüllt, solange der Zeitraum erledigt war.
 */
export function HabitList({ habits, compact = false }: { habits: Habit[]; compact?: boolean }) {
  const [, start] = useTransition();
  // Vorschau bis der Server antwortet: Häkchen und Serie sofort, der genaue Stand (Zeitraum, Verlauf) kommt danach
  const [optimistic, toggle] = useOptimistic(habits, (state, id: number) =>
    state.map((h) =>
      h.id === id
        ? {
            ...h,
            done: !h.done,
            checkedToday: !h.done,
            status: h.cadence === "daily" ? null : h.done ? "offen" : "erledigt",
            streak: h.done ? Math.max(0, h.streak - 1) : h.streak + 1,
            history: h.done ? h.history : h.history.map((d, i) => (i === h.history.length - 1 ? { ...d, done: true } : d)),
          }
        : h,
    ),
  );
  const run = (id: number) =>
    start(async () => {
      toggle(id);
      await toggleHabitAction(id);
    });

  return (
    <ul className="-mx-4">
      {optimistic.map((h, i) => (
        // Trennlinie erst ab dem Text, wie in iOS-Listen
        <li key={h.id} className={cn("relative", i > 0 && "before:absolute before:top-0 before:right-0 before:left-[3.75rem] before:z-10 before:h-[0.5px] before:bg-border")}>
          <SwipeRow
            leading={{
              label: h.done ? "Offen" : "Erledigt",
              icon: h.done ? RotateCcw : Check,
              tone: h.done ? "bg-muted-foreground" : "bg-good",
              onAction: () => run(h.id),
            }}
          >
            <button
              type="button"
              onClick={() => {
                haptic();
                run(h.id);
              }}
              aria-pressed={h.done}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-muted"
            >
              <span
                className={cn(
                  "grid size-[1.625rem] shrink-0 place-items-center rounded-full ring-[1.5px] transition-colors duration-200",
                  h.done ? "bg-good text-white ring-good" : "ring-muted-foreground/50",
                )}
                aria-hidden
              >
                {h.done ? <Check className="size-4 stroke-[3]" /> : null}
              </span>
              <span className="text-title3 leading-none" aria-hidden>
                {h.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("line-clamp-2 text-body break-words", h.done && "text-muted-foreground")}>{h.name}</span>
                {h.status ? (
                  <span className={cn("block truncate text-footnote text-muted-foreground", !h.done && /fällig|nur noch/.test(h.status) && "text-warning")}>
                    {h.status}
                  </span>
                ) : null}
              </span>
              {!compact && h.cadence === "daily" ? (
                <span className="hidden gap-1 sm:flex" aria-label="Letzte 7 Tage">
                  {h.history.map((d) => (
                    <span key={d.day} title={d.day} className={cn("size-2 rounded-full", d.done ? "bg-good" : "bg-muted")} />
                  ))}
                </span>
              ) : null}
              <span
                className={cn(
                  "flex min-w-10 items-center justify-end gap-0.5 text-subhead text-muted-foreground tabular-nums",
                  h.streak >= (h.cadence === "daily" ? 7 : 4) && "font-semibold text-serious",
                )}
                aria-label={h.streak ? `${h.streak} ${h.streakUnit} in Folge` : undefined}
                title={h.streak ? `${h.streak} ${h.streakUnit} in Folge` : undefined}
              >
                {h.streak > 0 ? (
                  <>
                    <Flame className="size-4" aria-hidden />
                    {h.streak}
                  </>
                ) : null}
              </span>
            </button>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}
