"use client";

import { Archive, ArchiveRestore, Check, FileUp, Layers, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  archivePlanAction,
  createStudyPlanAction,
  deleteMaterialAction,
  deletePlanAction,
  generateFlashcardsAction,
  toggleStudySessionAction,
  uploadMaterialsAction,
  type FormState,
} from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { SwipeRow } from "./ios/swipe-row";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/** Preise und Grenzen vom Server – `study.ts` ist server-only. */
export type CostInfo = { priceIn: number; priceOut: number; maxChars: number; demo: boolean };

type Row = { id: number; day: string; topic: string; tasks: string[]; minutes: number; done: boolean; planTitle?: string; overdue?: boolean };

const CHARS_PER_TOKEN = 4;
const nf = new Intl.NumberFormat("de-DE");
const WEEKDAYS = [
  [1, "Mo"],
  [2, "Di"],
  [3, "Mi"],
  [4, "Do"],
  [5, "Fr"],
  [6, "Sa"],
  [0, "So"],
] as const;

function Status({ state }: { state: FormState }) {
  return state ? (
    <p role="status" className={cn("w-full text-footnote", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  ) : null;
}

/** Geschätzte Kosten eines Aufrufs als kurzer Text („≈ 0,3 Cent“). */
function costText(cost: CostInfo, chars: number, outTokens: number): string {
  if (cost.demo) return "Demo-Modus: ohne KI, kostenlos";
  const inTokens = Math.min(chars, cost.maxChars) / CHARS_PER_TOKEN + 600;
  const cents = ((inTokens * cost.priceIn + outTokens * cost.priceOut) / 1_000_000) * 100;
  const tokens = `~${nf.format(Math.round(inTokens / 100) * 100)} Token`;
  return `${tokens} · ${cents < 0.1 ? "unter 0,1 Cent" : `≈ ${cents.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Cent`}`;
}

export const formatSize = (chars: number) =>
  `${chars < 1000 ? `${chars} Zeichen` : `${nf.format(Math.round(chars / 100) / 10)} Tsd. Zeichen`} · ~${nf.format(Math.ceil(chars / CHARS_PER_TOKEN))} Token`;

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Lerneinheiten zum Abhaken – Tipp auf den Kreis oder nach rechts wischen. Mit `showPlan` steht der
 * Plan dabei (Heute über alle Pläne), mit `showDay` das Datum (Detailseite).
 */
export function StudySessionList({ sessions, showPlan = false, showDay = false }: { sessions: Row[]; showPlan?: boolean; showDay?: boolean }) {
  const [, start] = useTransition();
  const [optimistic, toggle] = useOptimistic(sessions, (state, id: number) => state.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  const run = (id: number) =>
    start(async () => {
      toggle(id);
      await toggleStudySessionAction(id);
    });
  return (
    <ul className="-mx-4 -my-2">
      {optimistic.map((s, i) => (
        <li key={s.id} className={cn("relative", i > 0 && "before:absolute before:top-0 before:right-0 before:left-[3.25rem] before:z-10 before:h-[0.5px] before:bg-border")}>
          <SwipeRow
            leading={{
              label: s.done ? "Offen" : "Erledigt",
              icon: Check,
              tone: s.done ? "bg-muted-foreground" : "bg-good",
              onAction: () => run(s.id),
            }}
          >
            <div className="flex items-start gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  haptic();
                  run(s.id);
                }}
                aria-pressed={s.done}
                aria-label={`${s.topic} ${s.done ? "als offen markieren" : "abhaken"}`}
                className="-m-2.5 grid size-11 shrink-0 place-items-center rounded-full active:bg-muted"
              >
                <span
                  className={cn(
                    "grid size-[1.625rem] place-items-center rounded-full ring-[1.5px] transition-colors duration-200",
                    s.done ? "bg-good text-white ring-good" : "ring-muted-foreground/50",
                  )}
                  aria-hidden
                >
                  {s.done ? <Check className="size-4 stroke-[3]" /> : null}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-body font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{s.topic}</p>
                <p className="text-footnote text-muted-foreground">
                  {[
                    showDay ? shortDay(s.day) : null,
                    s.overdue ? `liegengeblieben (${shortDay(s.day)})` : null,
                    showPlan ? s.planTitle : null,
                    `${s.minutes} Min.`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {s.tasks.length && !s.done ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-subhead marker:text-muted-foreground">
                    {s.tasks.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}

export type ExamOption = { id: string; label: string; course: string | null; day: string };
export type MaterialOption = { id: number; title: string; subject: string | null; chars: number };

/** Material zum Fach vorauswählen – grob über den Wortanfang („Geschichtstest“ ↔ „Geschichte“). */
function matching(materials: MaterialOption[], label: string | undefined): number[] {
  const stem = label?.toLowerCase().slice(0, 5);
  if (!stem) return [];
  return materials.filter((m) => [m.subject, m.title].some((t) => t?.toLowerCase().startsWith(stem))).map((m) => m.id);
}

/** Neuer Lernplan: Klausur wählen (füllt Titel und Datum), Lernzeit, freie Tage, Material – mit Kostenschätzung. */
export function StudyPlanForm({ exams, materials, minDay, cost }: { exams: ExamOption[]; materials: MaterialOption[]; minDay: string; cost: CostInfo }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStudyPlanAction, null);
  const [title, setTitle] = useState(exams[0] ? exams[0].label : "");
  const [subject, setSubject] = useState(exams[0]?.course ?? "");
  const [examDay, setExamDay] = useState(exams[0]?.day ?? "");
  const [picked, setPicked] = useState<number[]>(() => matching(materials, exams[0]?.label));
  const chars = useMemo(() => materials.filter((m) => picked.includes(m.id)).reduce((n, m) => n + m.chars, 0), [materials, picked]);

  const chooseExam = (examId: string) => {
    const x = exams.find((e) => e.id === examId);
    setTitle(x?.label ?? "");
    setSubject(x?.course ?? "");
    setExamDay(x?.day ?? "");
    setPicked(matching(materials, x?.label));
  };

  return (
    <form action={action} className="space-y-4">
      {exams.length ? (
        <div className="space-y-1.5">
          <Label htmlFor="exam">Klausur</Label>
          <select
            id="exam"
            onChange={(e) => chooseExam(e.target.value)}
            defaultValue={exams[0].id}
            className="min-h-11 w-full rounded-[10px] bg-muted px-3 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {exams.map((x) => (
              <option key={x.id} value={x.id}>
                {[x.label, x.course, shortDay(x.day)].filter(Boolean).join(" · ")}
              </option>
            ))}
            <option value="">Andere Prüfung …</option>
          </select>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor="plan-title">Fach / Titel</Label>
          <Input id="plan-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="z. B. Informatik" required />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor="plan-subject">Kurs / Thema (optional)</Label>
          <Input id="plan-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={60} placeholder="z. B. LK, Analysis" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-day">Klausur am</Label>
          <Input id="plan-day" name="examDay" type="date" value={examDay} min={minDay} onChange={(e) => setExamDay(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-minutes">Minuten pro Tag</Label>
          <Input id="plan-minutes" name="minutesPerDay" type="number" inputMode="numeric" min={15} max={240} step={5} defaultValue={45} required />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Freie Tage</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(([value, label]) => (
            <label key={value} className="relative">
              <input type="checkbox" name="freeWeekdays" value={value} defaultChecked={value === 0} className="peer absolute inset-0 opacity-0" />
              <span className="grid min-h-11 min-w-11 place-items-center rounded-full bg-muted px-3 text-subhead font-medium peer-checked:bg-tint peer-checked:text-white peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Material als Grundlage</legend>
        {materials.length ? (
          <ul className="ios-rows rounded-[12px] bg-muted px-3">
            {materials.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    name="materialIds"
                    value={m.id}
                    checked={picked.includes(m.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                    className="size-5 accent-tint"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{m.title}</span>
                    <span className="block text-footnote text-muted-foreground">{[m.subject, formatSize(m.chars)].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-subhead text-muted-foreground">Noch kein Material – ohne Material plant die KI nur nach Fach und Datum.</p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Sparkles aria-hidden />
          {pending ? "Plan wird erstellt …" : "Lernplan erstellen"}
        </Button>
        <span className="text-footnote text-muted-foreground tabular-nums">
          {costText(cost, chars, 3000)}
          {chars > cost.maxChars ? " · Material wird gekürzt" : ""}
        </span>
      </div>
      <Status state={state} />
    </form>
  );
}

/** Markdown-Dateien hochladen (aus PDFs umgewandelt – günstiger für die KI). */
export function MaterialUpload() {
  const [{ result, round }, action, pending] = useActionState(
    async (prev: { result: FormState; round: number }, formData: FormData) => {
      const result = await uploadMaterialsAction(null, formData);
      if (result?.ok) haptic();
      return { result, round: result?.ok ? prev.round + 1 : prev.round };
    },
    { result: null, round: 0 },
  );
  return (
    <form key={round} action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-1.5">
          <Label htmlFor="files">Markdown-Dateien</Label>
          <Input id="files" name="files" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple required className="py-2.5 text-subhead" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="material-subject">Fach (optional)</Label>
          <Input id="material-subject" name="subject" maxLength={60} placeholder="z. B. Informatik" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          <FileUp aria-hidden />
          {pending ? "Wird hochgeladen …" : "Hochladen"}
        </Button>
        <span className="text-footnote text-muted-foreground">.md bis 2 MB – Bilder und Links werden vorher entfernt.</span>
      </div>
      <Status state={result} />
    </form>
  );
}

/** Ein Material mit Vorschau, Karteikarten-Knopf und Löschen. */
export function MaterialRow({ material, cost }: { material: MaterialOption & { preview: string }; cost: CostInfo }) {
  const [, start] = useTransition();
  const [state, action, pending] = useActionState<FormState, FormData>(generateFlashcardsAction, null);
  const [count, setCount] = useState(20);
  const remove = () => {
    if (confirm(`„${material.title}“ löschen? Erstellte Karteikarten-Stapel bleiben erhalten.`)) start(() => deleteMaterialAction(material.id));
  };
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{material.title}</p>
          <p className="text-footnote text-muted-foreground tabular-nums">{[material.subject, formatSize(material.chars)].filter(Boolean).join(" · ")}</p>
        </div>
        <button
          type="button"
          onClick={remove}
          aria-label={`${material.title} löschen`}
          className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-critical active:bg-muted"
        >
          <Trash2 className="size-[1.125rem]" aria-hidden />
        </button>
      </div>
      <details className="group mt-1">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-subhead text-tint-text active:opacity-60">
          <span className="group-open:hidden">Vorschau</span>
          <span className="hidden group-open:inline">Vorschau schließen</span>
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded-[10px] bg-muted p-3 text-footnote whitespace-pre-wrap">{material.preview}</pre>
      </details>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="materialId" value={material.id} />
        <label className="sr-only" htmlFor={`count-${material.id}`}>
          Anzahl Karten
        </label>
        <select
          id={`count-${material.id}`}
          name="count"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="min-h-9 rounded-full bg-muted px-3 text-subhead outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {[10, 20, 30, 50, 80].map((n) => (
            <option key={n} value={n}>
              {n} Karten
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Layers aria-hidden />
          {pending ? "Wird erstellt …" : "Karteikarten"}
        </Button>
        <span className="text-footnote text-muted-foreground tabular-nums">{costText(cost, material.chars, count * 50)}</span>
        <Status state={state} />
      </form>
    </li>
  );
}

/** Archivieren bzw. Löschen eines Plans (Detailseite). */
export function PlanActions({ planId, title, archived }: { planId: number; title: string; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(() => archivePlanAction(planId, !archived))}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? "Wiederherstellen" : "Archivieren"}
      </Button>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (confirm(`Lernplan „${title}“ mit allen Einheiten löschen?`)) start(() => deletePlanAction(planId));
        }}
      >
        <Trash2 aria-hidden />
        Löschen
      </Button>
    </div>
  );
}
