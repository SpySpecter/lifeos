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

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
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
