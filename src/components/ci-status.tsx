import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { CiState } from "@/integrations/github";

/** Statusfarbe immer mit Icon + Text, nie Farbe allein. */
export function CiStatus({ state }: { state: CiState }) {
  if (!state) return null;
  if (state === "SUCCESS")
    return (
      <span className="inline-flex items-center gap-1 text-footnote text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-good" aria-hidden /> CI ok
      </span>
    );
  if (state === "FAILURE" || state === "ERROR")
    return (
      <span className="inline-flex items-center gap-1 text-footnote text-muted-foreground">
        <XCircle className="size-3.5 text-critical" aria-hidden /> CI rot
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-footnote text-muted-foreground">
      <CircleDashed className="size-3.5 text-warning" aria-hidden /> läuft
    </span>
  );
}
