"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { archiveHabitAction, deleteHabitAction, restoreHabitAction } from "@/app/actions";
import { cn } from "@/lib/utils";

const KINDS = {
  archive: {
    icon: Archive,
    title: "Archivieren",
    confirm: (name: string) => `„${name}“ archivieren? Der Verlauf bleibt gespeichert.`,
    run: archiveHabitAction,
  },
  restore: { icon: ArchiveRestore, title: "Wiederherstellen", confirm: null, run: restoreHabitAction },
  delete: {
    icon: Trash2,
    title: "Löschen",
    confirm: (name: string) => `„${name}“ endgültig löschen? Der Verlauf wird mitgelöscht.`,
    run: deleteHabitAction,
  },
} as const;

export function HabitActionButton({ kind, id, name }: { kind: keyof typeof KINDS; id: number; name: string }) {
  const [pending, start] = useTransition();
  const k = KINDS[kind];
  const Icon = k.icon;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!k.confirm || confirm(k.confirm(name))) start(() => k.run(id));
      }}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-tint active:bg-muted disabled:opacity-50",
        kind === "delete" && "text-critical",
      )}
      aria-label={`${name} ${k.title.toLowerCase()}`}
      title={k.title}
    >
      <Icon className="size-[1.125rem]" aria-hidden />
    </button>
  );
}
