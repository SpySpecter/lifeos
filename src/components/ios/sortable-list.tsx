"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Drag = { index: number; startY: number; dy: number; target: number; tops: number[]; heights: number[] };

/** Zielposition der gezogenen Zeile: Anzahl der übrigen Zeilen, deren Mitte über der Mitte der gezogenen liegt. */
export function dropIndex(tops: number[], heights: number[], index: number, dy: number): number {
  const mid = tops[index] + heights[index] / 2 + dy;
  let target = 0;
  for (let j = 0; j < tops.length; j++) if (j !== index && tops[j] + heights[j] / 2 < mid) target++;
  return target;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Liste, deren Zeilen sich am Griff (≡) nach oben und unten ziehen lassen – wie „Bearbeiten“ in iOS-Listen.
 * Der Griff ist ein Knopf: Pfeil hoch/runter verschiebt per Tastatur, VoiceOver bekommt die neue Position angesagt.
 * `renderRow` bekommt den Griff und setzt ihn selbst in die Zeile (meist ganz rechts).
 */
export function SortableList<T>({
  items,
  getKey,
  itemLabel,
  renderRow,
  onReorder,
  className,
  "aria-label": ariaLabel,
}: {
  items: T[];
  getKey: (item: T) => string | number;
  itemLabel: (item: T) => string;
  renderRow: (item: T, handle: ReactNode) => ReactNode;
  onReorder: (next: T[]) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [announce, setAnnounce] = useState("");
  const refocus = useRef<string | number | null>(null);

  useEffect(() => {
    if (refocus.current === null) return;
    const key = String(refocus.current);
    refocus.current = null;
    rows.current.find((r) => r?.dataset.key === key)?.querySelector<HTMLButtonElement>("[data-sort-handle]")?.focus();
  });

  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const commit = (from: number, to: number) => {
    if (from === to) return;
    const item = items[from];
    onReorder(moveItem(items, from, to));
    setAnnounce(`${itemLabel(item)}: Position ${to + 1} von ${items.length}`);
  };

  const handle = (item: T, index: number) => (
    <button
      type="button"
      data-sort-handle
      data-no-pull
      aria-label={`${itemLabel(item)} verschieben`}
      aria-roledescription="Ziehgriff"
      aria-describedby="sortable-hint"
      className="-mr-2 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground active:cursor-grabbing active:bg-muted"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const boxes = rows.current.slice(0, items.length).map((r) => r?.getBoundingClientRect());
        if (boxes.some((b) => !b)) return;
        haptic();
        update({
          index,
          startY: e.clientY,
          dy: 0,
          target: index,
          tops: boxes.map((b) => b!.top),
          heights: boxes.map((b) => b!.height),
        });
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const top = d.tops[0] - d.tops[d.index];
        const bottom = d.tops[d.tops.length - 1] + d.heights[d.heights.length - 1] - d.tops[d.index] - d.heights[d.index];
        const dy = Math.min(Math.max(e.clientY - d.startY, top), bottom);
        update({ ...d, dy, target: dropIndex(d.tops, d.heights, d.index, dy) });
      }}
      onPointerUp={() => {
        const d = dragRef.current;
        if (!d) return;
        update(null);
        if (d.target !== d.index) haptic();
        commit(d.index, d.target);
      }}
      onPointerCancel={() => update(null)}
      onKeyDown={(e) => {
        const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const to = index + by;
        if (!by || to < 0 || to >= items.length) return;
        e.preventDefault();
        refocus.current = getKey(item);
        commit(index, to);
      }}
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  );

  // Versatz jeder Zeile während des Ziehens: die gezogene folgt dem Finger, die dazwischen weichen um ihre Höhe aus
  const offset = (j: number): number => {
    if (!drag) return 0;
    if (j === drag.index) return drag.dy;
    const h = drag.heights[drag.index];
    if (drag.index < drag.target && j > drag.index && j <= drag.target) return -h;
    if (drag.target < drag.index && j >= drag.target && j < drag.index) return h;
    return 0;
  };

  return (
    <>
      <ul className={className} aria-label={ariaLabel}>
        {items.map((item, j) => {
          const dragged = drag?.index === j;
          const y = offset(j);
          return (
            <li
              key={getKey(item)}
              data-key={getKey(item)}
              ref={(el) => {
                rows.current[j] = el;
              }}
              className={cn(
                "-mx-4 relative",
                drag && !dragged && "transition-transform duration-200 ease-out",
                dragged && "z-10 rounded-[12px] shadow-lg ring-1 ring-foreground/8",
              )}
              style={y ? { transform: `translateY(${y}px)` } : undefined}
            >
              {renderRow(item, handle(item, j))}
            </li>
          );
        })}
      </ul>
      <p id="sortable-hint" className="sr-only">
        Ziehen oder Pfeiltasten hoch und runter zum Verschieben.
      </p>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </>
  );
}
