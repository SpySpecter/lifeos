"use client";

import { Archive, Check, Loader2, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { decideMailAction, runMailTriageAction, undoMailAction, type FormState } from "@/app/actions";
import type { MailRow } from "@/lib/mail/triage";
import { CATEGORY_LABEL } from "@/lib/mail/policy";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { SwipeRow } from "./ios/swipe-row";

const ACTION_LABEL = { keep: "Behalten", archive: "Archivieren", trash: "Löschen" } as const;

function Pending({ row, multi }: { row: MailRow; multi: boolean }) {
  const [pending, start] = useTransition();
  const act = (a: "keep" | "archive" | "trash") => start(() => decideMailAction(row.account, row.id, a));
  return (
    <li className={cn("-mx-4", pending && "opacity-50")}>
      <SwipeRow
        leading={{ label: "Behalten", icon: Check, tone: "bg-good", onAction: () => act("keep") }}
        trailing={[
          { label: "Archiv", icon: Archive, tone: "bg-[var(--cat-inbox)]", onAction: () => act("archive") },
          { label: "Löschen", icon: Trash2, tone: "bg-critical", onAction: () => act("trash") },
        ]}
      >
        <div className="px-4 py-3">
          <p className="flex items-baseline gap-2">
            <span className="truncate text-body font-semibold">{row.fromName}</span>
            {multi ? <span className="shrink-0 text-footnote text-muted-foreground">{row.account.split("@")[0]}</span> : null}
          </p>
          <p className="truncate text-subhead text-muted-foreground">{row.subject}</p>
          <p className="mt-1 text-footnote text-muted-foreground">
            Vorschlag: <span className="font-semibold text-foreground">{ACTION_LABEL[row.action]}</span>
            {row.reason ? ` – ${row.reason}` : ""}
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
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
                onClick={() => {
                  haptic();
                  act(a);
                }}
                aria-label={`${row.fromName}: ${ACTION_LABEL[a]}${row.action === a ? " (Vorschlag)" : ""}`}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-subhead font-semibold active:opacity-70",
                  row.action === a ? "bg-primary text-primary-foreground" : "bg-muted",
                  row.action !== a && a === "trash" && "text-critical",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
      </SwipeRow>
    </li>
  );
}

function Recent({ row }: { row: MailRow }) {
  const [pending, start] = useTransition();
  return (
    <li className={cn("flex min-h-11 items-center gap-2.5", pending && "opacity-50")}>
      {row.action === "trash" ? (
        <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-label="gelöscht" />
      ) : (
        <Archive className="size-4 shrink-0 text-muted-foreground" aria-label="archiviert" />
      )}
      <span className="min-w-0 flex-1 truncate text-subhead">
        <span className="font-semibold">{row.fromName}</span> <span className="text-muted-foreground">· {row.subject}</span>
      </span>
      {row.category ? <span className="hidden shrink-0 text-footnote text-muted-foreground sm:inline">{CATEGORY_LABEL[row.category]}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => undoMailAction(row.account, row.id))}
        className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-tint active:bg-muted"
        title="Rückgängig (zurück in den Posteingang, Absender künftig behalten)"
        aria-label={`${row.subject} zurück in den Posteingang`}
      >
        <Undo2 className="size-[1.125rem]" aria-hidden />
      </button>
    </li>
  );
}

export function MailAssistant({ pending, recent, multi }: { pending: MailRow[]; recent: MailRow[]; multi: boolean }) {
  return (
    <div className="space-y-4">
      {pending.length ? (
        <div>
          <h3 className="text-footnote font-semibold text-muted-foreground">
            Deine Entscheidung ({pending.length})
          </h3>
          <ul className="ios-rows">
            {pending.slice(0, 4).map((r) => (
              <Pending key={r.account + r.id} row={r} multi={multi} />
            ))}
          </ul>
          {pending.length > 4 ? <p className="mt-2 text-footnote text-muted-foreground">+ {pending.length - 4} weitere</p> : null}
          <p className="mt-1 text-footnote text-muted-foreground">Tipp: Nach rechts wischen behält, nach links archiviert oder löscht.</p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-subhead text-muted-foreground">
          <Check className="size-4 text-good" aria-hidden /> Nichts zu entscheiden.
        </p>
      )}
      {recent.length ? (
        <div className="border-t border-border pt-3">
          <h3 className="text-footnote font-semibold text-muted-foreground">Zuletzt automatisch</h3>
          <ul className="ios-inset-rows [--inset:26px]">
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
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-body text-tint-text active:opacity-60 disabled:opacity-60"
        title="Posteingang jetzt sortieren"
      >
        {pending ? <Loader2 className="size-[1.125rem] animate-spin" aria-hidden /> : <Sparkles className="size-[1.125rem]" aria-hidden />}
        {pending ? "Sortiert …" : "Sortieren"}
      </button>
      {state ? (
        <p role="status" className={cn("max-w-64 text-right text-footnote", state.ok ? "text-muted-foreground" : "text-critical")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
