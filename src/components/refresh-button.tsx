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
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-tint-text hover:bg-muted active:opacity-60 disabled:opacity-60",
        label ? "px-3 text-subhead font-medium" : "min-w-11",
      )}
      aria-label={label ?? "Aktualisieren"}
      title={label ?? "Aktualisieren"}
    >
      <RotateCw className={cn("size-[1.125rem]", pending && "animate-spin")} aria-hidden />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
