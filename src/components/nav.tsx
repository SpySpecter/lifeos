"use client";

import { HeartPulse, LayoutGrid, ListChecks, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Übersicht", icon: LayoutGrid },
  { href: "/health", label: "Gesundheit", icon: HeartPulse },
  { href: "/habits", label: "Gewohnheiten", icon: ListChecks },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

/**
 * Auf dem Handy als Leiste unten (Daumenreichweite, Abstand zur Home-Leiste des iPhones).
 * Muss außerhalb des Headers stehen: dessen backdrop-filter würde `fixed` sonst am Header ausrichten.
 */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-foreground/8 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", active && "text-foreground")}
          >
            <Icon className={cn("size-5", active && "stroke-[2.25]")} aria-hidden />
            {label === "Gewohnheiten" ? "Habits" : label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Oben ab sm. */
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 sm:flex">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-card text-foreground ring-1 ring-foreground/8",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
