"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { archiveHabitAction } from "@/app/actions";

export function ArchiveHabitButton({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`„${name}“ archivieren? Der Verlauf bleibt gespeichert.`)) start(() => archiveHabitAction(id));
      }}
      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={`${name} archivieren`}
      title="Archivieren"
    >
      <Archive className="size-4" aria-hidden />
    </button>
  );
}
