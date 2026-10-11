"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { refreshAllAction } from "@/app/actions";
import { cn } from "@/lib/utils";

const THRESHOLD = 72;

/**
 * Als Homescreen-App hat iOS kein „Ziehen zum Aktualisieren“ – das ergänzen wir hier.
 * Nur im Standalone-Modus aktiv; im Browser bleibt das native Verhalten.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [pending, start] = useTransition();
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    let current = 0;
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      current = dy > 0 ? Math.min(dy * 0.5, THRESHOLD * 1.4) : 0;
      setPull(current);
    };
    const onEnd = () => {
      if (current >= THRESHOLD) {
        navigator.vibrate?.(10);
        start(async () => {
          await refreshAllAction();
          router.refresh();
        });
      }
      startY.current = null;
      current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  const visible = pending || pull > 8;
  return (
    <div
      aria-live="polite"
      className={cn("pointer-events-none flex justify-center overflow-hidden transition-[height] duration-150", visible ? "h-10" : "h-0")}
      style={pull ? { height: Math.min(pull, 56) } : undefined}
    >
      <span className="mt-2 grid size-8 place-items-center rounded-full bg-card ring-1 ring-foreground/8">
        <RefreshCw
          className={cn("size-4 text-muted-foreground", pending && "animate-spin", pull >= THRESHOLD && "text-foreground")}
          style={pending ? undefined : { transform: `rotate(${pull * 3}deg)` }}
          aria-hidden
        />
        <span className="sr-only">{pending ? "Wird aktualisiert" : ""}</span>
      </span>
    </div>
  );
}
