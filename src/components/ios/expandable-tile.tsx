"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Kompakte Kachel, die beim Antippen das ganze Widget an Ort und Stelle aufklappt (volle Breite).
 * Ein erneuter Tipp auf „Weniger“ klappt es wieder zu.
 */
export function ExpandableTile({ face, title, children }: { face: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={id}
        className="relative flex min-h-32 min-w-0 flex-col rounded-[20px] bg-card p-3.5 text-left transition-transform duration-150 active:scale-[0.97]"
      >
        {face}
        <ChevronDown className="absolute top-3.5 right-3 size-4 text-muted-foreground" aria-hidden />
      </button>
    );
  }
  return (
    <div id={id} className="relative col-span-full [&_section>header]:pr-24">
      {children}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        className="absolute top-0 right-0 flex min-h-11 items-center gap-1 rounded-full px-2 text-body text-tint-text active:opacity-60"
      >
        Weniger
        <ChevronDown className="size-5 rotate-180" aria-hidden />
      </button>
      <span className="sr-only">{title} aufgeklappt</span>
    </div>
  );
}

/** Platzhalter, solange die Kachel lädt. */
export function TileSkeleton({ className }: { className?: string }) {
  return <div className={cn("min-h-32 animate-pulse rounded-[20px] bg-card", className)} aria-hidden />;
}
