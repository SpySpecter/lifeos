"use client";

import { BellRing, Check, Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { addHabitAction, updateHabitAction, type FormState } from "@/app/actions";
import { HabitActionButton } from "./habit-actions";
import { HabitFields, type HabitDraft } from "./habit-fields";
import { Button } from "./ui/button";

function Status({ state }: { state: FormState }) {
  return state ? (
    <p role="status" className={state.ok ? "w-full text-sm text-muted-foreground" : "w-full text-sm text-critical"}>
      {state.message}
    </p>
  ) : null;
}

export function HabitForm() {
  // `round` zählt erfolgreiche Anlagen: neuer Key → Felder (inkl. Emoji-Zustand) starten leer
  const [{ result, round }, action, pending] = useActionState(
    async (prev: { result: FormState; round: number }, formData: FormData) => {
      const result = await addHabitAction(null, formData);
      return { result, round: result?.ok ? prev.round + 1 : prev.round };
    },
    { result: null, round: 0 },
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <HabitFields key={round} />
      <Button type="submit" disabled={pending}>
        Hinzufügen
      </Button>
      <Status state={result} />
    </form>
  );
}

/** Zeile in „Quote (30 Tage)“ mit Bearbeiten, Archivieren und Löschen; „Bearbeiten“ klappt darunter ein Formular auf. */
export function HabitManageRow({ habit, rate }: { habit: HabitDraft & { id: number }; rate: number }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="space-y-2">
      <div className="flex items-center gap-3">
        <span aria-hidden>{habit.emoji}</span>
        <span className="w-28 min-w-0 sm:w-40">
          <span className="block truncate">{habit.name}</span>
          {habit.remindAt ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <BellRing className="size-3" aria-hidden />
              <span className="sr-only">Erinnerung um</span>
              {habit.remindAt}
            </span>
          ) : null}
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${rate * 100}%` }} />
        </div>
        <span className="w-10 text-right text-muted-foreground tabular-nums">{Math.round(rate * 100)} %</span>
        <div className="flex">
          <button
            type="button"
            onClick={() => setEditing((o) => !o)}
            aria-expanded={editing}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
            aria-label={`${habit.name} bearbeiten`}
            title="Bearbeiten"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <HabitActionButton kind="archive" id={habit.id} name={habit.name} />
          <HabitActionButton kind="delete" id={habit.id} name={habit.name} />
        </div>
      </div>
      {editing ? <HabitEditForm habit={habit} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}

function HabitEditForm({ habit, onDone }: { habit: HabitDraft & { id: number }; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateHabitAction, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/8">
      <input type="hidden" name="id" value={habit.id} />
      <HabitFields initial={habit} autoFocus />
      <div className="flex gap-1">
        <Button type="submit" disabled={pending}>
          <Check aria-hidden /> Speichern
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}
