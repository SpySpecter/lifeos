"use client";

import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { refreshReviewAction } from "@/app/actions";
import { cn } from "@/lib/utils";

/** Rückblick neu bauen – frische Zahlen und ein neuer Kommentar. */
export function ReviewRefresh({ week }: { week: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => refreshReviewAction(week))}
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-subhead font-medium text-tint-text active:opacity-60 disabled:opacity-60"
    >
      <RotateCw className={cn("size-[1.125rem]", pending && "animate-spin")} aria-hidden />
      {pending ? "Wird erstellt …" : "Neu erstellen"}
    </button>
  );
}
