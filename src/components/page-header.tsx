"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Großer Titel wie in iOS-Apps. Scrollt er aus dem Bild, blendet oben eine schmale Glas-Leiste
 * mit dem Titel ein (Scroll-Edge-Effekt), damit man immer weiß, wo man ist.
 */
export function PageHeader({
  title,
  eyebrow,
  trailing,
  back,
  children,
}: {
  /** Zurück-Link oben links wie in einer iOS-Navigationsleiste */
  back?: { href: string; label: string };
  title: ReactNode;
  /** kleine Zeile über dem Titel, z. B. das Datum */
  eyebrow?: ReactNode;
  /** Knöpfe rechts neben dem Titel (z. B. Einstellungen) */
  trailing?: ReactNode;
  /** kurzer Text für die eingeklappte Leiste, falls `title` kein reiner Text ist */
  children?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-8px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div
        aria-hidden={!collapsed}
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-20 border-b border-transparent bg-transparent pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-200 desktop:hidden",
          collapsed && "pointer-events-auto border-border bg-bar backdrop-blur-xl backdrop-saturate-150",
        )}
      >
        <div className="relative flex h-11 items-center justify-center px-24">
          {back ? (
            <Link href={back.href} className={cn("absolute top-0 left-1 flex h-11 max-w-23 items-center text-body text-tint-text opacity-0 transition-opacity", collapsed && "opacity-100")} inert={!collapsed}>
              <ChevronLeft className="size-6 shrink-0" aria-hidden />
              {/* wie iOS: passt der Titel der Vorseite nicht neben den Titel, heißt der Knopf „Zurück“ */}
              <span className="truncate">{back.label.length > 8 ? "Zurück" : back.label}</span>
            </Link>
          ) : null}
          <span className={cn("truncate text-body font-semibold opacity-0 transition-opacity duration-200", collapsed && "opacity-100")}>
            {children ?? title}
          </span>
          {trailing ? (
            <div className={cn("absolute top-0 right-2 flex h-11 items-center opacity-0 transition-opacity", collapsed && "opacity-100")} inert={!collapsed}>
              {trailing}
            </div>
          ) : null}
        </div>
      </div>

      {back ? (
        <Link href={back.href} className="-ml-2 flex min-h-11 w-fit items-center text-body text-tint-text active:opacity-60">
          <ChevronLeft className="size-6" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <header className="flex items-end gap-2 pt-2 desktop:pt-0">
        <div ref={ref} className="min-w-0 flex-1">
          {eyebrow ? <p className="text-footnote font-semibold text-muted-foreground uppercase">{eyebrow}</p> : null}
          <h1 className="font-heading text-largetitle font-bold tracking-tight text-balance">{title}</h1>
        </div>
        {trailing ? <div className="-mr-2 mb-0.5 flex shrink-0 items-center">{trailing}</div> : null}
      </header>
    </>
  );
}
