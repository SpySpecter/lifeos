"use client";

import { BookOpen, GraduationCap, Heart, ListChecks, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const TABS = [
  { href: "/", label: "Heute", icon: Sun },
  { href: "/schule", label: "Schule", icon: GraduationCap },
  { href: "/habits", label: "Habits", icon: ListChecks },
  { href: "/lernen", label: "Lernen", icon: BookOpen },
  { href: "/health", label: "Gesundheit", icon: Heart },
] as const;

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

/**
 * Tab-Leiste wie in iOS 26: schwebt über dem Inhalt, Glas-Hintergrund, aktiver Tab in der Akzentfarbe
 * mit hinterlegter Kapsel. Steht außerhalb von Elementen mit backdrop-filter (sonst richtet sich `fixed` daran aus).
 */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-md grid-cols-5 gap-1 rounded-full bg-bar p-1 shadow-[0_8px_30px_rgb(0_0_0/0.12)] ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 sm:hidden dark:ring-white/10"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-caption2 font-medium text-foreground/80 transition-colors active:bg-muted",
              active && "bg-muted text-tint",
            )}
          >
            <Icon className="size-[1.375rem]" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.2 : 0} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Ab sm: Tabs oben in der Leiste. */
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 sm:flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-subhead text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-tint")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Zahnrad zu den Einstellungen – selten gebraucht, darum kein eigener Tab. */
export function SettingsLink({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <Link
      href="/settings"
      aria-label="Einstellungen"
      aria-current={path.startsWith("/settings") ? "page" : undefined}
      className={cn(
        "grid size-11 place-items-center rounded-full text-tint hover:bg-muted active:bg-muted aria-[current=page]:bg-muted",
        className,
      )}
    >
      <Settings className="size-[1.375rem]" aria-hidden />
    </Link>
  );
}
