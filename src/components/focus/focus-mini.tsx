"use client";

import { Pause, Play, SkipForward, SlidersHorizontal, Timer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { apply } from "./focus-dock";
import { focusStore, openFocus, useFocus } from "./store";
import { clock, displayMs, focusedMs, nextRound, pause, phaseLabel, resume } from "./timer";

const MIN = 60_000;

/**
 * Mini-Timer als eigene Seite: nur Zeit, Phase und ein großer Knopf – gedacht für Slide Over bzw. ein
 * schmales Stage-Manager-Fenster neben GoodNotes. Ersatz für Bild-in-Bild, das iPadOS in Home-Bildschirm-Apps
 * und für Canvas-Streams blockiert. Phasenwechsel, Ton und Push übernimmt weiter das FocusDock im Layout.
 */
export function FocusMini() {
  const { timer } = useFocus();
  const router = useRouter();
  // 0 bis zum ersten Takt: Date.now() darf beim Vorrendern nicht gelesen werden
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const close = () => {
    haptic();
    if (window.history.length > 1) router.back();
    else router.push("/lernen");
  };

  const tone = !timer?.running ? "idle" : timer.phase === "break" ? "break" : "work";
  const total = timer ? (timer.phase === "work" ? timer.workMin : timer.breakMin) * MIN : 0;
  const progress = timer && now && timer.kind === "pomodoro" && timer.phase !== "ready" && total ? 1 - displayMs(timer, now) / total : null;

  return (
    // über Tab-Leiste (z-30) und Pille (z-35), unter dem Sheet (z-40)
    <div className="fixed inset-0 z-[38] flex flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <div className="flex items-center justify-between px-2 pt-2">
        <button type="button" onClick={close} aria-label="Mini-Timer schließen" className="grid size-11 place-items-center rounded-full text-tint-text active:bg-muted">
          <X className="size-5" aria-hidden />
        </button>
        {timer ? (
          <button
            type="button"
            onClick={() => {
              haptic();
              focusStore.setSheet(true);
            }}
            aria-label="Steuerung öffnen"
            className="grid size-11 place-items-center rounded-full text-tint-text active:bg-muted"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      {timer && now ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-8 text-center">
          <p className="max-w-full truncate text-body text-muted-foreground">{timer.subject}</p>
          <p className="font-heading text-[clamp(3.5rem,24vw,10rem)] leading-none font-bold tracking-tight tabular-nums">{clock(displayMs(timer, now))}</p>
          <p className={cn("text-title3 font-semibold", tone === "work" ? "text-tint-text" : tone === "break" ? "text-good" : "text-muted-foreground")}>
            {phaseLabel(timer)}
          </p>
          {progress !== null ? (
            <div className="mt-2 h-2 w-full max-w-72 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className={cn("h-full rounded-full", tone === "break" ? "bg-good" : tone === "work" ? "bg-tint" : "bg-muted-foreground")} style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
            </div>
          ) : null}
          <p className="text-footnote text-muted-foreground tabular-nums">
            {Math.floor(focusedMs(timer, now) / MIN)} Min. fokussiert{timer.rounds ? ` · ${timer.rounds} ${timer.rounds === 1 ? "Runde" : "Runden"}` : ""}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                haptic();
                if (timer.phase === "ready") apply(nextRound);
                else apply(timer.running ? pause : resume);
              }}
              aria-label={timer.phase === "ready" ? "Nächste Runde" : timer.running ? "Anhalten" : "Weiter"}
              className="grid size-16 place-items-center rounded-full bg-tint text-white active:opacity-70"
            >
              {timer.running ? <Pause className="size-7" aria-hidden /> : <Play className="size-7" aria-hidden />}
            </button>
            {timer.phase === "break" ? (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  apply(nextRound);
                }}
                aria-label="Pause überspringen"
                className="grid size-12 place-items-center rounded-full bg-muted text-tint-text active:opacity-70"
              >
                <SkipForward className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : now ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-8 text-center">
          <p className="text-body text-muted-foreground">Kein Fokus-Timer aktiv.</p>
          <Button size="lg" onClick={() => openFocus()}>
            <Timer aria-hidden />
            Fokus starten
          </Button>
        </div>
      ) : null}
    </div>
  );
}
