"use client";

import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { refreshAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export function RefreshButton({ integration, label }: { integration: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => refreshAction(integration))}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      aria-label={label ?? "Aktualisieren"}
      title={label ?? "Aktualisieren"}
    >
      <RotateCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
