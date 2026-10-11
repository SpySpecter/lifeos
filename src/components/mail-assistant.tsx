"use client";

import { Archive, Check, Loader2, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { decideMailAction, runMailTriageAction, undoMailAction, type FormState } from "@/app/actions";
import type { MailRow } from "@/lib/mail/triage";
import { CATEGORY_LABEL } from "@/lib/mail/policy";
import { cn } from "@/lib/utils";

const ACTION_LABEL = { keep: "Behalten", archive: "Archivieren", trash: "Löschen" } as const;

function Pending({ row, multi }: { row: MailRow; multi: boolean }) {
  const [pending, start] = useTransition();
  const act = (a: "keep" | "archive" | "trash") => start(() => decideMailAction(row.account, row.id, a));
  return (
    <li className={cn("rounded-xl bg-muted/50 p-3", pending && "opacity-50")}>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="truncate font-medium">{row.fromName}</span>
        {multi ? <span className="shrink-0 text-xs text-muted-foreground">{row.account.split("@")[0]}</span> : null}
      </p>
      <p className="truncate text-sm text-muted-foreground">{row.subject}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Vorschlag: <span className="font-medium text-foreground">{ACTION_LABEL[row.action]}</span>
        {row.reason ? ` – ${row.reason}` : ""}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(
          [
            ["keep", Check, "Behalten"],
            ["archive", Archive, "Archiv"],
            ["trash", Trash2, "Löschen"],
          ] as const
        ).map(([a, Icon, label]) => (
          <button
            key={a}
            type="button"
            disabled={pending}
            onClick={() => act(a)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium ring-1 ring-foreground/10 hover:bg-background",
              row.action === a && "bg-background ring-foreground/30",
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
    </li>
  );
}

function Recent({ row }: { row: MailRow }) {
  const [pending, start] = useTransition();
  return (
    <li className={cn("flex items-center gap-2 py-1.5 text-sm", pending && "opacity-50")}>
      {row.action === "trash" ? (
        <Trash2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="gelöscht" />
      ) : (
        <Archive className="size-3.5 shrink-0 text-muted-foreground" aria-label="archiviert" />
      )}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{row.fromName}</span> <span className="text-muted-foreground">· {row.subject}</span>
      </span>
      {row.category ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{CATEGORY_LABEL[row.category]}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => undoMailAction(row.account, row.id))}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Rückgängig (zurück in den Posteingang, Absender künftig behalten)"
        aria-label={`${row.subject} wiederherstellen`}
      >
        <Undo2 className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

export function MailAssistant({ pending, recent, multi }: { pending: MailRow[]; recent: MailRow[]; multi: boolean }) {
  return (
    <div className="space-y-4">
      {pending.length ? (
        <div>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Deine Entscheidung ({pending.length})
          </h3>
          <ul className="space-y-2">
            {pending.slice(0, 4).map((r) => (
              <Pending key={r.account + r.id} row={r} multi={multi} />
            ))}
          </ul>
          {pending.length > 4 ? <p className="mt-2 text-xs text-muted-foreground">+ {pending.length - 4} weitere</p> : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-good" aria-hidden /> Nichts zu entscheiden.
        </p>
      )}
      {recent.length ? (
        <div className="border-t pt-3">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Zuletzt automatisch</h3>
          <ul>
            {recent.map((r) => (
              <Recent key={r.account + r.id} row={r} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RunTriageButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(runMailTriageAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
        title="Posteingang jetzt sortieren"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
        {pending ? "Sortiert …" : "Jetzt sortieren"}
      </button>
      {state ? (
        <p role="status" className={cn("max-w-64 text-right text-[11px]", state.ok ? "text-muted-foreground" : "text-critical")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
