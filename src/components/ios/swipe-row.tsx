"use client";

import type { LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type SwipeAction = {
  label: string;
  icon: LucideIcon;
  /** Hintergrundklasse, z. B. "bg-good" */
  tone: string;
  onAction: () => void;
};

const ACTION_WIDTH = 76;
const LEADING_TRIGGER = 88;

/**
 * Listenzeile mit Wischgesten wie in Mail/Erinnerungen:
 * nach rechts wischen = Hauptaktion (beim Loslassen über der Schwelle), nach links = weitere Aktionen aufdecken.
 * Nur für Touch; die Aktionen bleiben zusätzlich als normale Knöpfe erreichbar (VoiceOver, Tastatur).
 */
export function SwipeRow({
  leading,
  trailing = [],
  open: controlledOpen,
  onOpenChange,
  className,
  children,
}: {
  leading?: SwipeAction;
  trailing?: SwipeAction[];
  /** von außen gesteuert, z. B. über einen „…“-Knopf */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [openState, setOpenState] = useState(false);
  const open = controlledOpen ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const start = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null } | null>(null);
  const moved = useRef(false);
  // aktueller Versatz auch als Ref: beim Loslassen zählt der letzte Wert, nicht der des letzten Renders
  const current = useRef(0);

  const trailingWidth = trailing.length * ACTION_WIDTH;
  const offset = dragging ? dx : open ? -trailingWidth : 0;

  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -trailingWidth : 0, axis: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s.axis === "x") {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ohne Capture geht es auch, nur weniger robust am Rand */
        }
        setDragging(true);
      }
    }
    if (s.axis !== "x") return;
    moved.current = true;
    let next = s.base + mx;
    if (next > 0 && !leading) next = 0;
    if (next < 0 && !trailing.length) next = 0;
    // Gummiband jenseits der Aktionen
    if (next < -trailingWidth) next = -trailingWidth - Math.sqrt(-trailingWidth - next) * 4;
    if (next > LEADING_TRIGGER) next = LEADING_TRIGGER + Math.sqrt(next - LEADING_TRIGGER) * 4;
    current.current = next;
    setDx(next);
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x") return;
    const dx = current.current;
    current.current = 0;
    setDragging(false);
    if (dx >= LEADING_TRIGGER && leading) {
      haptic();
      leading.onAction();
      setOpen(false);
    } else if (dx < -trailingWidth / 2) {
      haptic();
      setOpen(true);
    } else setOpen(false);
    setDx(0);
  };

  const leadingArmed = dragging && dx >= LEADING_TRIGGER;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {leading && offset > 0 ? (
        <div className={cn("absolute inset-y-0 left-0 flex items-center pl-5 text-white", leading.tone)} style={{ width: Math.max(offset, 0) }} aria-hidden>
          <leading.icon className={cn("size-6 transition-transform", leadingArmed && "scale-125")} />
        </div>
      ) : null}
      {trailing.length ? (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(-offset, 0) }} inert={!open} aria-hidden={!open}>
          {trailing.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setOpen(false);
                a.onAction();
              }}
              className={cn("flex flex-1 flex-col items-center justify-center gap-1 overflow-hidden text-caption2 font-medium whitespace-nowrap text-white", a.tone)}
            >
              <a.icon className="size-5" aria-hidden />
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // Ein Wischen ist kein Tipp; offene Aktionen schließt ein Tipp auf die Zeile
          if (moved.current || open) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
            if (open) setOpen(false);
          }
        }}
        className={cn("relative touch-pan-y bg-card", !dragging && "transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]")}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
