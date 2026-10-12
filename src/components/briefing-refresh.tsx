"use client";

import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { refreshBriefingAction } from "@/app/actions";
import { cn } from "@/lib/utils";

/** Briefing für heute neu bauen – holt alle Quellen frisch und fragt die KI erneut nach den Nachrichten. */
export function BriefingRefresh() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => refreshBriefingAction())}
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-subhead font-medium text-tint-text active:opacity-60 disabled:opacity-60"
    >
      <RotateCw className={cn("size-[1.125rem]", pending && "animate-spin")} aria-hidden />
      {pending ? "Wird erstellt …" : "Neu erstellen"}
    </button>
  );
}
