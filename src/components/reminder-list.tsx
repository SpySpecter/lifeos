"use client";

import { BellRing, Check, Circle, ExternalLink, Trash2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { completeReminderAction, deleteReminderAction } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { SwipeRow } from "./ios/swipe-row";

export type ReminderRow = {
  id: number;
  title: string;
  note: string | null;
  when: string;
  url: string | null;
  source: "manuell" | "termin";
  status: "offen" | "gesendet" | "verpasst" | "erledigt";
};

/** Erinnerungen auf „Heute“: rechts wischen oder den Kreis tippen = erledigt, links wischen = löschen. */
export function ReminderList({ rows }: { rows: ReminderRow[] }) {
  const [visible, hide] = useOptimistic(rows, (list, id: number) => list.filter((r) => r.id !== id));
  const [, start] = useTransition();
  const act = (id: number, action: (id: number) => Promise<void>) =>
    start(async () => {
      hide(id);
      await action(id);
    });
  if (!visible.length) return null;
  return (
    <section aria-labelledby="erinnerungen" className="overflow-hidden rounded-[20px] bg-card">
      <h2 id="erinnerungen" className="flex items-center gap-1.5 px-4 pt-3 text-footnote font-semibold">
        <BellRing className="size-4 text-[var(--status-warning)]" aria-hidden />
        Erinnerungen
      </h2>
      <ul className="divide-y divide-border pb-1">
        {visible.map((r) => (
          <li key={r.id}>
            <SwipeRow
              leading={{ label: "Erledigt", icon: Check, tone: "bg-good", onAction: () => act(r.id, completeReminderAction) }}
              trailing={[{ label: "Löschen", icon: Trash2, tone: "bg-critical", onAction: () => act(r.id, deleteReminderAction) }]}
            >
              <div className="flex min-h-14 items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  aria-label={`„${r.title}“ erledigt`}
                  onClick={() => {
                    haptic();
                    act(r.id, completeReminderAction);
                  }}
                  className="-m-2 grid size-11 shrink-0 place-items-center text-muted-foreground active:opacity-60"
                >
                  <Circle className="size-[1.375rem]" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body">{r.title}</p>
                  <p className={cn("truncate text-footnote text-muted-foreground", r.status === "verpasst" && "text-critical")}>
                    {r.when}
                    {r.status === "gesendet" ? " · gesendet" : r.status === "verpasst" ? " · verpasst" : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`„${r.title}“ im Kalender öffnen`}
                    className="grid size-11 shrink-0 place-items-center text-tint active:opacity-60"
                  >
                    <ExternalLink className="size-[1.125rem]" aria-hidden />
                  </a>
                ) : null}
              </div>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </section>
  );
}
