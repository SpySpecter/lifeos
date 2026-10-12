"use client";

import { cn } from "@/lib/utils";

/** Segmentierte Auswahl wie UISegmentedControl. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid auto-cols-fr grid-flow-col rounded-[9px] bg-muted p-[2px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-8 rounded-[7px] px-2 text-footnote font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-card shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] dark:bg-elevated" : "text-foreground/80",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
