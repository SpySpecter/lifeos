import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import type { WidgetResult } from "@/integrations/core";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";

export function WidgetCard({
  title,
  icon: Icon,
  href,
  action,
  footer,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex h-full flex-col rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5", className)}>
      <header className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-medium text-muted-foreground">
          {href ? (
            <Link href={href} className="hover:text-foreground">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <div className="ml-auto flex items-center gap-1">{action}</div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {footer ? <footer className="mt-3 text-xs text-muted-foreground">{footer}</footer> : null}
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
      <div className="flex h-full flex-col items-start justify-center gap-2 py-4 text-sm text-muted-foreground">
        <PlugZap className="size-5" aria-hidden />
        <p>{result.hint}</p>
        {result.connectHref ? (
          <Link href={result.connectHref} className="font-medium text-foreground underline underline-offset-4">
            Einrichten
          </Link>
        ) : null}
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 py-4 text-sm">
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
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5 text-warning" aria-hidden />
          Quelle gerade nicht erreichbar – Stand {relativeTime(result.fetchedAt)}
        </p>
      ) : null}
    </>
  );
}

export function WidgetSkeleton({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <section className={cn("h-full rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5", className)} aria-busy="true">
      <div className="mb-4 h-4 w-28 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </section>
  );
}
