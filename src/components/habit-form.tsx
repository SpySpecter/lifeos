"use client";

import { Archive, BellRing, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { addHabitAction, archiveHabitAction, deleteHabitAction, reorderHabitsAction, updateHabitAction, type FormState } from "@/app/actions";
import { rhythmLabel } from "@/lib/habits";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { HabitFields, type HabitDraft } from "./habit-fields";
import { SortableList } from "./ios/sortable-list";
import { SwipeRow } from "./ios/swipe-row";
import { Button } from "./ui/button";

function Status({ state }: { state: FormState }) {
  return state ? (
    <p role="status" className={cn("w-full text-footnote", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  ) : null;
}

/** „+ Neue Gewohnheit“ wie die letzte Zeile in Erinnerungen; klappt das Formular auf. */
export function HabitForm() {
  const [open, setOpen] = useState(false);
  // `round` zählt erfolgreiche Anlagen: neuer Key → Felder (inkl. Emoji-Zustand) starten leer
  const [{ result, round }, action, pending] = useActionState(
    async (prev: { result: FormState; round: number }, formData: FormData) => {
      const result = await addHabitAction(null, formData);
      if (result?.ok) haptic();
      return { result, round: result?.ok ? prev.round + 1 : prev.round };
    },
    { result: null, round: 0 },
  );
  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full items-center gap-3 text-body font-medium text-tint-text active:opacity-60"
        >
          <span className="grid size-[1.625rem] place-items-center rounded-full bg-tint text-white" aria-hidden>
            <Plus className="size-4 stroke-[3]" />
          </span>
          Neue Gewohnheit
        </button>
        {result?.ok ? <Status state={result} /> : null}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <HabitFields key={round} autoFocus />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Hinzufügen
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Fertig
        </Button>
      </div>
      <Status state={result} />
    </form>
  );
}

/**
 * Zeile in „Verwalten“: Quote der letzten 30 Tage. Nach links wischen deckt Bearbeiten, Archivieren und Löschen auf;
 * der Stift öffnet das Formular (dort stehen dieselben Aktionen – auch für VoiceOver und Tastatur).
 */
export function HabitManageRow({ habit, rate, handle }: { habit: HabitDraft & { id: number }; rate: number; handle?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const archive = () => start(() => archiveHabitAction(habit.id));
  const remove = () => {
    if (confirm(`„${habit.name}“ endgültig löschen? Der Verlauf wird mitgelöscht.`)) start(() => deleteHabitAction(habit.id));
  };
  return (
    <>
      <SwipeRow
        trailing={[
          { label: "Bearbeiten", icon: Pencil, tone: "bg-muted-foreground", onAction: () => setEditing(true) },
          { label: "Archiv", icon: Archive, tone: "bg-[var(--cat-exams)]", onAction: archive },
          { label: "Löschen", icon: Trash2, tone: "bg-critical", onAction: remove },
        ]}
      >
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">
          <span className="text-title3 leading-none" aria-hidden>
            {habit.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body">{habit.name}</span>
            <span className="flex items-center gap-2 text-footnote whitespace-nowrap text-muted-foreground tabular-nums">
              <span className="h-1.5 w-16 rounded-full bg-muted" aria-hidden>
                <span className="block h-1.5 rounded-full bg-good" style={{ width: `${rate * 100}%` }} />
              </span>
              {Math.round(rate * 100)} %
              {habit.cadence !== "daily" ? <span className="truncate">· {rhythmLabel(habit)}</span> : null}
              {habit.remindAt ? (
                <span className="flex items-center gap-1">
                  · <BellRing className="size-3.5" aria-hidden />
                  <span className="sr-only">Erinnerung um</span>
                  {habit.remindAt}
                </span>
              ) : null}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setEditing((o) => !o)}
            aria-expanded={editing}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-tint active:bg-muted aria-expanded:bg-muted"
            aria-label={`${habit.name} bearbeiten`}
          >
            <Pencil className="size-[1.125rem]" aria-hidden />
          </button>
          {handle}
        </div>
      </SwipeRow>
      {editing ? (
        <div className="px-4 pb-3">
          <HabitEditForm habit={habit} onDone={() => setEditing(false)} onArchive={archive} onDelete={remove} />
        </div>
      ) : null}
    </>
  );
}

type ManagedHabit = HabitDraft & { id: number; rate: number };

/** „Verwalten“: Zeilen am Griff umsortieren; die neue Reihenfolge gilt sofort (optimistisch) und überall. */
export function HabitManageList({ habits }: { habits: ManagedHabit[] }) {
  const [, start] = useTransition();
  const [current, apply] = useOptimistic(habits, (_: ManagedHabit[], next: ManagedHabit[]) => next);
  return (
    <SortableList
      aria-label="Gewohnheiten"
      className="-my-2 ios-inset-rows [--inset:52px]"
      items={current}
      getKey={(h) => h.id}
      itemLabel={(h) => h.name}
      onReorder={(next) =>
        start(async () => {
          apply(next);
          await reorderHabitsAction(next.map((h) => h.id));
        })
      }
      renderRow={(h, handle) => (
        <HabitManageRow habit={{ id: h.id, name: h.name, emoji: h.emoji, remindAt: h.remindAt, cadence: h.cadence, intervalDays: h.intervalDays }} rate={h.rate} handle={handle} />
      )}
    />
  );
}

function HabitEditForm({
  habit,
  onDone,
  onArchive,
  onDelete,
}: {
  habit: HabitDraft & { id: number };
  onDone: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateHabitAction, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-[14px] bg-muted/60 p-3">
      <input type="hidden" name="id" value={habit.id} />
      <HabitFields initial={habit} autoFocus />
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          Sichern
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <span className="ml-auto flex">
          <Button type="button" variant="ghost" onClick={onArchive}>
            <Archive aria-hidden /> Archivieren
          </Button>
          <Button type="button" variant="ghost" className="text-critical" onClick={onDelete}>
            <Trash2 aria-hidden /> Löschen
          </Button>
        </span>
      </div>
      <Status state={state} />
    </form>
  );
}
