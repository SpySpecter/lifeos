"use client";

import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addCardAction,
  createDeckAction,
  deleteCardAction,
  deleteDeckAction,
  finishReviewAction,
  renameDeckAction,
  reviewCardAction,
  updateCardAction,
  type FormState,
} from "@/app/actions";
import { againThisSession, previewIntervals, RATINGS, schedule, type CardState, type Rating } from "@/lib/fsrs";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export type ReviewCard = CardState & { id: number; front: string; back: string; section: string | null };
type Mode = "fsrs" | "quick";

function Status({ state }: { state: FormState }) {
  return state ? (
    <p role="status" className={cn("w-full text-footnote", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  ) : null;
}

const textarea =
  "min-h-20 w-full rounded-[10px] bg-muted px-3 py-2.5 text-body outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

const shuffle = <T,>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Lernsitzung. FSRS: vier Bewertungen mit Intervall-Vorschau, Lernkarten kommen in derselben Sitzung wieder.
 * Quick Learn: gemischt durchgehen, „Nicht gewusst“ wandert ans Ende, bis alles sitzt – ohne FSRS zu verändern.
 * Tastatur: Leertaste = umdrehen, 1–4 = bewerten (Quick: 1 = nicht gewusst, 2–4 = gewusst). Wischen: links = nochmal, rechts = gut.
 */
export function ReviewSession({ cards, mode, backHref }: { cards: ReviewCard[]; mode: Mode; backHref: string }) {
  const [queue, setQueue] = useState<ReviewCard[]>(() => (mode === "quick" ? shuffle(cards) : cards));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState({ reviewed: 0, again: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [, start] = useTransition();
  const finished = useRef(false);
  const card = queue[0];

  useEffect(() => {
    if (!card && !finished.current && done.reviewed) {
      finished.current = true;
      start(() => finishReviewAction());
    }
  }, [card, done.reviewed]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!card || !flipped) return;
      haptic();
      const t = Date.now();
      setNow(t);
      setFlipped(false);
      setDone((d) => ({ reviewed: d.reviewed + 1, again: d.again + (rating === 1 ? 1 : 0) }));
      if (mode === "quick") {
        setQueue(([first, ...rest]) => (rating === 1 ? [...rest, first] : rest));
        return;
      }
      // lokal vorrechnen, damit es ohne Warten weitergeht; der Server speichert seine eigene Rechnung
      const next = { ...card, ...schedule(card, rating, t) };
      setQueue(([, ...rest]) => (againThisSession(next, t) ? [...rest, next] : rest));
      start(async () => {
        await reviewCardAction(card.id, rating);
      });
    },
    [card, flipped, mode],
  );

  // Tastatur: Listener nur einmal registrieren, die aktuelle Bewertung kommt über die Ref (schnelles Tippen geht sonst verloren)
  const rateRef = useRef(rate);
  useLayoutEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
      } else if (["1", "2", "3", "4"].includes(e.key)) rateRef.current(Number(e.key) as Rating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Wischgeste auf der umgedrehten Karte
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);

  const preview = useMemo(() => (card && mode === "fsrs" ? previewIntervals(card, now) : null), [card, mode, now]);

  if (!card) {
    return (
      <div className="rounded-[20px] bg-card p-6 text-center">
        <p className="text-largetitle">🎉</p>
        <p className="mt-2 text-title3 font-bold">{done.reviewed ? "Geschafft!" : "Nichts fällig"}</p>
        <p className="mt-1 text-subhead text-muted-foreground">
          {done.reviewed
            ? `${done.reviewed} Antworten${done.again ? `, ${done.again}× nochmal` : ""}.`
            : "Für heute ist alles wiederholt – mit Quick Learn kannst du trotzdem üben."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={backHref} className={buttonVariants()}>
            Fertig
          </Link>
          {mode === "quick" && cards.length ? (
            <Button
              variant="outline"
              onClick={() => {
                finished.current = false;
                setDone({ reviewed: 0, again: 0 });
                setQueue(shuffle(cards));
              }}
            >
              <RotateCcw aria-hidden />
              Nochmal mischen
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const left = queue.length;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between px-1 text-footnote text-muted-foreground tabular-nums">
        <span>{mode === "quick" ? "Quick Learn" : "Wiederholen"}</span>
        <span>
          {left} übrig{done.reviewed ? ` · ${done.reviewed} beantwortet` : ""}
        </span>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Antwort" : "Karte umdrehen"}
        onClick={() => {
          if (!flipped) {
            haptic();
            setFlipped(true);
          }
        }}
        onPointerDown={(e) => {
          if (flipped && e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!swipe.current) return;
          const x = e.clientX - swipe.current.x;
          if (Math.abs(x) > Math.abs(e.clientY - swipe.current.y)) setDx(x);
        }}
        onPointerUp={() => {
          if (swipe.current && Math.abs(dx) > 90) rate(dx > 0 ? 3 : 1);
          swipe.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          swipe.current = null;
          setDx(0);
        }}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
        className={cn(
          "flex min-h-[18rem] cursor-pointer touch-pan-y flex-col rounded-[20px] bg-card p-6 transition-[box-shadow] select-none md:min-h-[22rem]",
          !dx && "transition-transform",
          dx > 90 && "ring-2 ring-good",
          dx < -90 && "ring-2 ring-critical",
        )}
      >
        {card.section ? <p className="text-footnote font-medium text-muted-foreground">{card.section}</p> : null}
        <p className="mt-2 text-title2 font-semibold whitespace-pre-wrap">{card.front}</p>
        {flipped ? (
          <>
            <div className="my-5 h-px bg-border" />
            <p className="text-title3 whitespace-pre-wrap">{card.back}</p>
          </>
        ) : (
          <p className="mt-auto pt-6 text-center text-subhead text-muted-foreground">Tippen zum Umdrehen</p>
        )}
      </div>
      {flipped ? (
        mode === "quick" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant="destructive" onClick={() => rate(1)}>
              <X aria-hidden />
              Nicht gewusst
            </Button>
            <Button size="lg" className="bg-good text-white hover:bg-good/80" onClick={() => rate(3)}>
              <Check aria-hidden />
              Gewusst
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map(({ rating, label }) => (
              <button
                key={rating}
                type="button"
                onClick={() => rate(rating)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-[14px] px-1 text-subhead font-semibold active:opacity-70",
                  rating === 1 && "bg-critical/12 text-critical",
                  rating === 2 && "bg-warning/15 text-warning",
                  rating === 3 && "bg-good/15 text-good",
                  rating === 4 && "bg-tint/15 text-tint-text",
                )}
              >
                {label}
                <span className="text-caption font-normal opacity-80 tabular-nums">{preview?.[rating]}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <Button size="lg" className="w-full" onClick={() => setFlipped(true)}>
          Antwort zeigen
        </Button>
      )}
      <p className="text-center text-footnote text-muted-foreground">Wischen: links = {mode === "quick" ? "nicht gewusst" : "nochmal"}, rechts = {mode === "quick" ? "gewusst" : "gut"}</p>
    </div>
  );
}

/** Neuer, leerer Stapel zum Selbst-Befüllen. */
export function NewDeckForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createDeckAction, null);
  return (
    <details className="group mt-3 border-t border-border pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-subhead text-tint-text">
        <Plus className="size-4" aria-hidden />
        Eigener Stapel
      </summary>
      <form action={action} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="deck-title">Name</Label>
          <Input id="deck-title" name="title" maxLength={120} placeholder="z. B. Englisch Vokabeln Unit 3" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deck-subject">Fach</Label>
          <Input id="deck-subject" name="subject" maxLength={60} placeholder="optional" />
        </div>
        <Button type="submit" disabled={pending}>
          Anlegen
        </Button>
        <Status state={state} />
      </form>
    </details>
  );
}

/** Stapel umbenennen und löschen. */
export function DeckSettings({ deck }: { deck: { id: number; title: string; subject: string | null } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(renameDeckAction.bind(null, deck.id), null);
  const [removing, start] = useTransition();
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="deck-name">Name</Label>
        <Input id="deck-name" name="title" defaultValue={deck.title} maxLength={120} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="deck-fach">Fach</Label>
        <Input id="deck-fach" name="subject" defaultValue={deck.subject ?? ""} maxLength={60} placeholder="optional" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          Speichern
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={removing}
          onClick={() => {
            if (confirm(`Stapel „${deck.title}“ mit allen Karten löschen?`)) start(() => deleteDeckAction(deck.id));
          }}
        >
          <Trash2 aria-hidden />
          Stapel löschen
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

/** Karte von Hand hinzufügen; das Formular leert sich danach für die nächste. */
export function AddCardForm({ deckId }: { deckId: number }) {
  const [{ result, round }, action, pending] = useActionState(
    async (prev: { result: FormState; round: number }, formData: FormData) => {
      const result = await addCardAction(deckId, null, formData);
      if (result?.ok) haptic();
      return { result, round: result?.ok ? prev.round + 1 : prev.round };
    },
    { result: null, round: 0 },
  );
  return (
    <form key={round} action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="card-front">Vorderseite</Label>
        <textarea id="card-front" name="front" maxLength={1000} required autoFocus={round > 0} placeholder="Frage oder Begriff" className={textarea} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-back">Rückseite</Label>
        <textarea id="card-back" name="back" maxLength={2000} required placeholder="Antwort" className={textarea} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden />
          Karte hinzufügen
        </Button>
        <Status state={result} />
      </div>
    </form>
  );
}

/** Karte in der Liste: antippen zum Bearbeiten. */
export function CardRow({ card, status }: { card: { id: number; front: string; back: string }; status: string }) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  if (editing) {
    return (
      <li className="space-y-2 py-3">
        <textarea aria-label="Vorderseite" value={front} onChange={(e) => setFront(e.target.value)} maxLength={1000} className={textarea} />
        <textarea aria-label="Rückseite" value={back} onChange={(e) => setBack(e.target.value)} maxLength={2000} className={textarea} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updateCardAction(card.id, front, back);
                setState(res);
                if (res?.ok) setEditing(false);
              })
            }
          >
            Speichern
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-critical"
            disabled={pending}
            onClick={() => {
              if (confirm("Karte löschen?")) start(() => deleteCardAction(card.id));
            }}
          >
            <Trash2 aria-hidden />
            Löschen
          </Button>
          <Status state={state} />
        </div>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => setEditing(true)} className="-mx-4 flex w-[calc(100%+2rem)] items-start gap-3 px-4 py-2.5 text-left active:bg-muted">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-body font-medium whitespace-pre-wrap">{card.front}</span>
          <span className="line-clamp-2 block text-subhead text-muted-foreground whitespace-pre-wrap">{card.back}</span>
        </span>
        <span className="shrink-0 pt-0.5 text-footnote text-muted-foreground tabular-nums">{status}</span>
        <Pencil className="mt-1 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </button>
    </li>
  );
}
