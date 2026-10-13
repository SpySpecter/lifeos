"use client";

import { Coffee, Pause, PictureInPicture2, Play, Plus, SkipForward, Square, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelFocusAction, finishFocusAction, focusOptionsAction, startFocusAction, updateFocusAction, type FocusOptions } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Segmented } from "../ios/segmented";
import { Sheet } from "../ios/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { drawFrame, enterPip, exitPip, pipActive, pipErrorMessage, pipSupported, preparePip, releasePip, PIP_H, PIP_W } from "./pip";
import { focusStore, openFocus, useFocus, type FocusPreset } from "./store";
import {
  addMinutes,
  advance,
  clock,
  displayMs,
  focusedMs,
  nextRound,
  pause,
  phaseLabel,
  resume,
  serverPhase,
  startTimer,
  type FocusTimer,
} from "./timer";

const MIN = 60_000;
const POS_KEY = "lifeos-focus-pos";

/** Kurzer Ton am Phasenende (nur solange die App offen ist; sonst kommt der Push). */
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}
function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.45);
  }
}

/** Server über die neue Phase informieren (für den Push), samt bisher fokussierter Minuten. */
function sync(t: FocusTimer, now: number) {
  if (t.id === null) return;
  const { phase, endsAt } = serverPhase(t);
  void updateFocusAction(t.id, phase, endsAt, focusedMs(t, now) / MIN).catch(() => undefined);
}

function apply(fn: (t: FocusTimer, now: number) => FocusTimer) {
  const now = Date.now();
  const t = focusStore.get().timer;
  if (!t) return;
  const next = fn(t, now);
  focusStore.setTimer(next);
  sync(next, now);
}

/**
 * Fokus-Timer, der auf jeder Seite schwebt: eine verschiebbare Pille über der Tab-Leiste, ein Sheet zum
 * Starten und Steuern und Bild-in-Bild, damit die Zeit auch über GoodNotes & Co. sichtbar bleibt.
 * Steht im Layout direkt im <body> (außerhalb von backdrop-filter, sonst verrutscht `fixed`).
 */
export function FocusDock() {
  const { timer, sheetOpen, preset } = useFocus();
  // 0 bis zum ersten Takt: Date.now() darf beim Vorrendern des Layouts nicht gelesen werden
  const [now, setNow] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inPip, setInPip] = useState(false);
  const [pipError, setPipError] = useState<string | null>(null);

  // Sekundentakt, Phasen weiterschalten, Bild-in-Bild neu malen
  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const cur = focusStore.get().timer;
      if (!cur) return;
      const { timer: next, events } = advance(cur, t);
      if (events.length) {
        focusStore.setTimer(next);
        sync(next, t);
        chime();
        haptic();
      }
      if (canvasRef.current) {
        // Stream schon vor dem Tipp starten; das folgende Malen liefert ihm das erste Bild
        if (videoRef.current) preparePip(canvasRef.current, videoRef.current);
        const total = next.phase === "work" ? next.workMin * MIN : next.breakMin * MIN;
        drawFrame(canvasRef.current, {
          time: clock(displayMs(next, t)),
          subject: next.subject,
          label: phaseLabel(next),
          progress: next.kind === "pomodoro" && next.phase !== "ready" ? 1 - displayMs(next, t) / total : null,
          tone: !next.running ? "idle" : next.phase === "break" ? "break" : "work",
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    // nach dem Aufwachen aus dem Hintergrund sofort nachziehen
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timer]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => {
      setInPip(pipActive(v));
      setPipError(null);
    };
    v.addEventListener("enterpictureinpicture", on);
    v.addEventListener("leavepictureinpicture", on);
    v.addEventListener("webkitpresentationmodechanged", on);
    return () => {
      v.removeEventListener("enterpictureinpicture", on);
      v.removeEventListener("leavepictureinpicture", on);
      v.removeEventListener("webkitpresentationmodechanged", on);
    };
  }, []);

  // kein async/await vor enterPip: der PiP-Aufruf muss synchron im Tipp passieren
  const togglePip = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setPipError(null);
    (pipActive(v) ? exitPip(v) : enterPip(c, v)).catch((err: unknown) => {
      console.warn("[fokus] Bild-in-Bild:", err);
      setPipError(pipErrorMessage(err));
    });
  }, []);

  // Ende: Bild-in-Bild schließen und Stream beenden
  useEffect(() => {
    const v = videoRef.current;
    if (timer || !v) return;
    const release = () => releasePip(v);
    if (pipActive(v)) void exitPip(v).finally(release);
    else release();
  }, [timer]);

  return (
    <>
      {timer && now && !sheetOpen ? <FocusPill timer={timer} now={now} /> : null}
      <Sheet open={sheetOpen} onOpenChange={focusStore.setSheet} title="Fokus">
        {timer && now ? (
          <FocusControls timer={timer} now={now} inPip={inPip} pipError={pipError} onPip={togglePip} />
        ) : sheetOpen ? (
          <FocusSetup preset={preset} />
        ) : null}
      </Sheet>
      {/* Quelle für Bild-in-Bild: praktisch unsichtbar, aber im Dokument und nicht ganz transparent
          (sonst startet bzw. pausiert iPadOS das gemutete Video) */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 size-px overflow-hidden opacity-[0.01]">
        <canvas ref={canvasRef} width={PIP_W} height={PIP_H} />
        <video ref={videoRef} muted playsInline width={PIP_W} height={PIP_H} />
      </div>
    </>
  );
}

/** Schwebende Pille: Tippen öffnet das Sheet, Ziehen verschiebt sie (Position bleibt gespeichert). */
function FocusPill({ timer, now }: { timer: FocusTimer; now: number }) {
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(POS_KEY) : null;
      return raw ? (JSON.parse(raw) as { right: number; bottom: number }) : null;
    } catch {
      return null;
    }
  });
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tone = !timer.running ? "idle" : timer.phase === "break" ? "break" : "work";
  const Icon = timer.phase === "break" ? Coffee : Timer;

  const onPointerDown = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { x: e.clientX, y: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const w = ref.current?.offsetWidth ?? 160;
    const h = ref.current?.offsetHeight ?? 48;
    setPos({
      right: Math.min(window.innerWidth - w - 8, Math.max(8, d.right - dx)),
      bottom: Math.min(window.innerHeight - h - 8, Math.max(8, d.bottom - dy)),
    });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      try {
        if (pos) window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        // egal
      }
      return;
    }
    haptic();
    focusStore.setSheet(true);
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Fokus-Timer: ${timer.subject}, ${phaseLabel(timer)}, ${clock(displayMs(timer, now))}. Öffnen`}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && focusStore.setSheet(true)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
      className={cn(
        "fixed z-[35] flex touch-none items-center gap-2 rounded-full border border-border bg-bar py-1.5 pr-1.5 pl-3 shadow-[0_8px_30px_rgb(0_0_0/0.18)] backdrop-blur-xl backdrop-saturate-150 select-none",
        !pos && "right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+76px)] desktop:bottom-6",
      )}
    >
      <Icon className={cn("size-4 shrink-0", tone === "work" ? "text-tint" : tone === "break" ? "text-good" : "text-muted-foreground")} aria-hidden />
      <span className="max-w-32 truncate text-footnote font-medium text-muted-foreground">{timer.subject}</span>
      <span className="text-body font-semibold tabular-nums">{clock(displayMs(timer, now))}</span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          haptic();
          if (timer.phase === "ready") apply(nextRound);
          else apply(timer.running ? pause : resume);
        }}
        aria-label={timer.phase === "ready" ? "Nächste Runde" : timer.running ? "Anhalten" : "Weiter"}
        className="grid size-9 place-items-center rounded-full bg-muted text-tint-text active:opacity-70"
      >
        {timer.running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

const MODES = [
  { value: "25", label: "25/5" },
  { value: "50", label: "50/10" },
  { value: "eigene", label: "Eigene" },
  { value: "frei", label: "Stoppuhr" },
] as const;
type Mode = (typeof MODES)[number]["value"];

function FocusSetup({ preset }: { preset: FocusPreset | null }) {
  const [options, setOptions] = useState<FocusOptions | null>(null);
  const [subject, setSubject] = useState(preset?.subject ?? "");
  const [sessionId, setSessionId] = useState<number | null>(preset?.studySessionId ?? null);
  const [mode, setMode] = useState<Mode>("25");
  const [work, setWork] = useState(preset?.minutes ?? 30);
  const [rest, setRest] = useState(5);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    focusOptionsAction()
      .then((o) => alive && setOptions(o))
      .catch(() => alive && setOptions({ sessions: [], subjects: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const start = async () => {
    const name = subject.trim();
    if (!name) {
      setError("Woran arbeitest du? Fach eingeben.");
      return;
    }
    unlockAudio();
    haptic();
    const [workMin, breakMin] = mode === "25" ? [25, 5] : mode === "50" ? [50, 10] : mode === "eigene" ? [work, rest] : [0, 0];
    const now = Date.now();
    const t = startTimer({ subject: name, studySessionId: sessionId, kind: mode === "frei" ? "frei" : "pomodoro", workMin, breakMin }, now);
    focusStore.setTimer(t);
    focusStore.setSheet(false);
    try {
      const id = await startFocusAction({ subject: name, studySessionId: sessionId, kind: t.kind, endsAt: t.phaseEndsAt });
      focusStore.update((cur) => ({ ...cur, id }));
      // falls in der Zwischenzeit pausiert wurde: Stand nachreichen
      const cur = focusStore.get().timer;
      if (cur && (cur.phaseEndsAt !== t.phaseEndsAt || !cur.running)) sync(cur, Date.now());
    } catch {
      // ohne Server läuft der Timer trotzdem; nur Push und Statistik fehlen
    }
  };

  return (
    <div className="space-y-5">
      {options?.sessions.length ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Heute geplant</legend>
          <ul className="ios-rows rounded-[12px] bg-card px-3">
            {options.sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSubject(s.subject);
                    setSessionId(s.id);
                    setWork(s.minutes);
                  }}
                  aria-pressed={sessionId === s.id}
                  className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-[1.5px]", sessionId === s.id ? "bg-tint ring-tint" : "ring-muted-foreground/50")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{s.topic}</span>
                    <span className="block text-footnote text-muted-foreground">
                      {s.subject} · {s.minutes} Min.
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="focus-subject">Fach</Label>
        <Input
          id="focus-subject"
          list="focus-subjects"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setSessionId(null);
            setError(null);
          }}
          maxLength={80}
          placeholder="z. B. Mathematik"
        />
        <datalist id="focus-subjects">
          {options?.subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Takt</span>
        <Segmented label="Takt" value={mode} options={[...MODES]} onChange={setMode} />
        {mode === "eigene" ? (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="focus-work">Fokus (Min.)</Label>
              <Input id="focus-work" type="number" inputMode="numeric" min={5} max={180} value={work} onChange={(e) => setWork(Math.min(180, Math.max(5, Number(e.target.value) || 5)))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="focus-rest">Pause (Min.)</Label>
              <Input id="focus-rest" type="number" inputMode="numeric" min={1} max={60} value={rest} onChange={(e) => setRest(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </div>
        ) : null}
        <p className="text-footnote text-muted-foreground">
          {mode === "frei" ? "Zählt einfach hoch, bis du stoppst." : "Nach jeder Runde kommt eine Pause – mit Ton und Mitteilung."}
        </p>
      </div>
      {error ? <p className="text-footnote text-critical">{error}</p> : null}
      <Button size="lg" className="w-full" onClick={start}>
        <Play aria-hidden />
        Fokus starten
      </Button>
    </div>
  );
}

function FocusControls({
  timer,
  now,
  inPip,
  pipError,
  onPip,
}: {
  timer: FocusTimer;
  now: number;
  inPip: boolean;
  pipError: string | null;
  onPip: () => void;
}) {
  const [markDone, setMarkDone] = useState(true);
  const [canPip] = useState(pipSupported);
  const focused = Math.floor(focusedMs(timer, now) / MIN);
  const finish = async () => {
    haptic();
    const t = focusStore.get().timer;
    focusStore.setTimer(null);
    focusStore.setSheet(false);
    if (t?.id) await finishFocusAction(t.id, focusedMs(t, Date.now()) / MIN, markDone && t.studySessionId !== null).catch(() => undefined);
  };
  const discard = async () => {
    if (!confirm("Sitzung verwerfen? Die Zeit wird nicht gezählt.")) return;
    const t = focusStore.get().timer;
    focusStore.setTimer(null);
    focusStore.setSheet(false);
    if (t?.id) await cancelFocusAction(t.id).catch(() => undefined);
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-subhead text-muted-foreground">{timer.subject}</p>
        <p className="font-heading text-[4.5rem] leading-none font-bold tracking-tight tabular-nums">{clock(displayMs(timer, now))}</p>
        <p className={cn("mt-1 text-subhead font-semibold", timer.phase === "break" ? "text-good" : timer.running ? "text-tint-text" : "text-muted-foreground")}>
          {phaseLabel(timer)}
        </p>
        <p className="mt-1 text-footnote text-muted-foreground tabular-nums">
          {focused} Min. fokussiert{timer.rounds ? ` · ${timer.rounds} ${timer.rounds === 1 ? "Runde" : "Runden"}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {timer.phase === "ready" ? (
          <Button size="lg" onClick={() => apply(nextRound)}>
            <Play aria-hidden />
            Nächste Runde
          </Button>
        ) : (
          <Button size="lg" onClick={() => apply(timer.running ? pause : resume)}>
            {timer.running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {timer.running ? "Anhalten" : "Weiter"}
          </Button>
        )}
        {timer.phase === "break" ? (
          <Button size="lg" variant="outline" onClick={() => apply(nextRound)}>
            <SkipForward aria-hidden />
            Pause überspringen
          </Button>
        ) : null}
        {timer.kind === "pomodoro" && timer.phase !== "ready" ? (
          <Button size="lg" variant="outline" onClick={() => apply((t) => addMinutes(t, 5))}>
            <Plus aria-hidden />5 Min.
          </Button>
        ) : null}
        {canPip ? (
          <Button size="lg" variant="outline" onClick={onPip}>
            <PictureInPicture2 aria-hidden />
            {inPip ? "Bild-in-Bild aus" : "Bild-in-Bild"}
          </Button>
        ) : null}
      </div>
      {canPip && pipError ? <p className="text-center text-footnote text-critical">{pipError}</p> : null}
      {canPip ? (
        <p className="text-center text-footnote text-muted-foreground">Bild-in-Bild legt den Timer als kleines Fenster über andere Apps, z. B. GoodNotes.</p>
      ) : null}
      <div className="space-y-3 border-t border-border pt-4">
        {timer.studySessionId !== null ? (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="size-5 accent-tint" />
            <span className="text-body">Lerneinheit beim Beenden abhaken</span>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={finish}>
            <Square aria-hidden />
            Beenden & speichern
          </Button>
          <Button variant="ghost" className="text-critical" onClick={discard}>
            <Trash2 aria-hidden />
            Verwerfen
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Knopf „Fokus“: öffnet das Sheet (läuft schon ein Timer, dessen Steuerung). */
export function FocusButton({ preset, className, label = "Fokus" }: { preset?: FocusPreset; className?: string; label?: string }) {
  return (
    <Button
      variant="outline"
      className={className}
      onClick={() => {
        haptic();
        openFocus(preset);
      }}
    >
      <Timer aria-hidden />
      {label}
    </Button>
  );
}
