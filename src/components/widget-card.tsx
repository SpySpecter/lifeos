import Link from "next/link";
import { AlertTriangle, ChevronRight, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import type { WidgetResult } from "@/integrations/core";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";

/**
 * Abschnitt wie in Health/Fitness: fetter Titel über einer abgerundeten Karte, rechts optionale Aktion
 * und – bei `href` – ein „Alle“-Link mit Chevron in der Akzentfarbe.
 */
export function WidgetCard({
  title,
  href,
  hrefLabel = "Alle",
  action,
  footer,
  className,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <header className="mb-2 flex min-h-11 items-center gap-2 px-1">
        <h2 className="min-w-0 truncate text-title3 font-bold tracking-tight">{title}</h2>
        <div className="ml-auto flex shrink-0 items-center">
          {action}
          {href ? (
            <Link href={href} className="flex min-h-11 items-center gap-0.5 rounded-full pr-1 pl-2 text-body text-tint-text active:opacity-60">
              {hrefLabel}
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] bg-card p-4">{children}</div>
      {footer ? <footer className="mt-2 px-4 text-footnote text-muted-foreground">{footer}</footer> : null}
    </section>
  );
}

/** Rendert ein Integrationsergebnis inkl. „nicht eingerichtet“-, Fehler- und Veraltet-Zuständen. */
export function ResultView<T>({
  result,
  integration,
  children,
}: {
  result: WidgetResult<T>;
  integration?: string;
  children: (data: T) => ReactNode;
}) {
  if (result.status === "unconfigured") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 py-2 text-subhead text-muted-foreground">
        <PlugZap className="size-5" aria-hidden />
        <p>{result.hint}</p>
        {result.connectHref ? (
          <Link href={result.connectHref} className="flex min-h-11 items-center font-semibold text-tint-text">
            Einrichten
          </Link>
        ) : null}
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 py-2 text-subhead">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 text-critical" aria-hidden /> Konnte nicht geladen werden
        </p>
        <p className="text-muted-foreground">{result.message}</p>
        {integration ? <RefreshButton integration={integration} label="Erneut versuchen" /> : null}
      </div>
    );
  }
  return (
    <>
      {children(result.data)}
      {result.stale ? (
        <p className="mt-3 flex items-center gap-1.5 text-footnote text-muted-foreground">
          <AlertTriangle className="size-3.5 text-warning" aria-hidden />
          Quelle gerade nicht erreichbar – Stand {relativeTime(result.fetchedAt)}
        </p>
      ) : null}
    </>
  );
}

export function WidgetSkeleton({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <section className={className} aria-busy="true" aria-label="Lädt">
      <div className="mb-2 flex min-h-11 items-center px-1">
        <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-3 rounded-[20px] bg-card p-4">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </section>
  );
}
