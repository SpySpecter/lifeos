"use client";

import { Download, Plus, Settings2, Trash2, X } from "lucide-react";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import {
  addGradeAction,
  addGradeCourseAction,
  deleteGradeAction,
  deleteGradeCourseAction,
  importGradeCoursesAction,
  setGradeSemesterAction,
  updateGradeCourseAction,
  type FormState,
} from "@/app/actions";
import type { CourseKind, GradeKind, Needed, Semester } from "@/lib/grades";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Segmented } from "./ios/segmented";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const SEMS: Semester[] = ["Q1", "Q2", "Q3", "Q4"];
const KINDS: { value: GradeKind; label: string }[] = [
  { value: "klausur", label: "Klausur" },
  { value: "muendlich", label: "Mündlich" },
  { value: "sonstig", label: "Sonstige" },
];
const POINTS = Array.from({ length: 16 }, (_, i) => 15 - i);
const select = "min-h-11 rounded-[10px] bg-muted px-3 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Status({ state }: { state: FormState }) {
  return state ? (
    <p role="status" className={cn("w-full text-footnote", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  ) : null;
}

/** Punkte als Ampel: unter 5 kritisch (Unterkurs), sonst neutral. */
const pointsTone = (p: number | null) => (p === null ? "text-muted-foreground" : p < 5 ? "text-critical" : "");

export function SemesterPicker({ value }: { value: Semester }) {
  const [current, setCurrent] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <Segmented
      label="Halbjahr"
      value={current}
      options={SEMS.map((s) => ({ value: s, label: s }))}
      onChange={(s) =>
        start(async () => {
          setCurrent(s);
          await setGradeSemesterAction(s);
        })
      }
      className="w-56"
    />
  );
}

export type CourseView = {
  id: number;
  subject: string;
  kind: CourseKind;
  klausurWeight: number;
  target: number | null;
  examSlot: number | null;
  examExpected: number | null;
  /** Halbjahrespunkte Q1–Q4 (null = noch nichts) */
  semesters: Record<Semester, { points: number; exact: number; official: boolean } | null>;
  grades: { id: number; kind: GradeKind; points: number; label: string | null; day: string; weight: number }[];
  needed: Needed | null;
};

function neededText(n: Needed, target: number): string {
  if (n.status === "sicher") return `${target} P. sind in diesem Halbjahr sicher – solange der Rest so bleibt.`;
  if (n.status === "unerreichbar") return `${target} P. sind mit einer Klausur nicht mehr drin (höchstens ${n.best} P.).`;
  return `Für ${target} P. brauchst du in der nächsten Klausur mindestens ${n.points} P.`;
}

export function GradeCourseCard({ course, semester }: { course: CourseView; semester: Semester }) {
  const [settings, setSettings] = useState(false);
  const [, start] = useTransition();
  const [grades, removeGrade] = useOptimistic(course.grades, (list, gradeId: number) => list.filter((g) => g.id !== gradeId));
  const cur = course.semesters[semester];
  const [{ result, round }, add, adding] = useActionState(
    async (prev: { result: FormState; round: number }, formData: FormData) => {
      const result = await addGradeAction(course.id, null, formData);
      if (result?.ok) haptic();
      return { result, round: result?.ok ? prev.round + 1 : prev.round };
    },
    { result: null, round: 0 },
  );

  return (
    <section className="rounded-[20px] bg-card p-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-title3 font-bold tracking-tight">
            <span className="truncate">{course.subject}</span>
            <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-caption font-semibold", course.kind === "LK" ? "bg-[var(--cat-grades)]/15 text-foreground" : "bg-muted text-muted-foreground")}>
              {course.kind}
            </span>
            {course.examSlot ? <span className="shrink-0 text-caption font-medium text-muted-foreground">P{course.examSlot}</span> : null}
          </h3>
          <div className="mt-1.5 flex gap-1.5" aria-label="Halbjahre">
            {SEMS.map((s) => {
              const sp = course.semesters[s];
              return (
                <span
                  key={s}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-caption tabular-nums",
                    s === semester ? "bg-tint/15 font-semibold text-tint-text" : "bg-muted text-muted-foreground",
                  )}
                  title={sp?.official ? "offizielle Halbjahresnote" : undefined}
                >
                  {s} {sp ? sp.points : "–"}
                  {sp?.official ? "✓" : ""}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <p className={cn("font-heading text-largetitle leading-none font-bold tabular-nums", pointsTone(cur?.points ?? null))}>{cur ? cur.points : "–"}</p>
          <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">
            {cur ? (cur.official ? "offiziell" : `genau ${cur.exact.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`) : "Punkte"}
          </p>
        </div>
      </header>

      {course.target && course.needed ? (
        <p
          className={cn(
            "mt-3 rounded-[12px] px-3 py-2 text-subhead",
            course.needed.status === "unerreichbar" ? "bg-critical/10 text-critical" : course.needed.status === "sicher" ? "bg-good/12" : "bg-tint/10",
          )}
        >
          {neededText(course.needed, course.target)}
        </p>
      ) : null}

      {grades.length ? (
        <ul className="mt-3 ios-rows">
          {grades.map((g) => (
            <li key={g.id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span className="w-20 shrink-0 text-footnote text-muted-foreground">{KINDS.find((k) => k.value === g.kind)?.label}</span>
              <span className="min-w-0 flex-1 truncate text-subhead">
                {g.label ?? new Date(`${g.day}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "UTC" })}
                {g.weight !== 1 ? <span className="text-muted-foreground"> · ×{g.weight.toLocaleString("de-DE")}</span> : null}
              </span>
              <span className={cn("text-body font-semibold tabular-nums", pointsTone(g.points))}>{g.points} P.</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Note löschen?"))
                    start(async () => {
                      removeGrade(g.id);
                      await deleteGradeAction(g.id);
                    });
                }}
                aria-label="Note löschen"
                className="-mr-2 grid size-9 place-items-center rounded-full text-muted-foreground active:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-subhead text-muted-foreground">Noch keine Noten in {semester}.</p>
      )}

      <form key={round} action={add} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="semester" value={semester} />
        <label className="sr-only" htmlFor={`kind-${course.id}`}>
          Art
        </label>
        <select id={`kind-${course.id}`} name="kind" defaultValue="klausur" className={select}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`points-${course.id}`}>
          Punkte
        </label>
        <select id={`points-${course.id}`} name="points" defaultValue="" required className={cn(select, "w-28 tabular-nums")}>
          <option value="" disabled>
            Punkte
          </option>
          {POINTS.map((p) => (
            <option key={p} value={p}>
              {p} P.
            </option>
          ))}
        </select>
        <Input name="label" maxLength={60} placeholder="Notiz (optional)" aria-label="Notiz" className="min-w-28 flex-1" />
        <Button type="submit" size="icon" disabled={adding} aria-label="Note eintragen">
          <Plus aria-hidden />
        </Button>
        <Status state={result} />
      </form>

      <button
        type="button"
        onClick={() => setSettings((o) => !o)}
        aria-expanded={settings}
        className="mt-2 flex min-h-11 items-center gap-1.5 text-subhead text-tint-text active:opacity-60"
      >
        <Settings2 className="size-4" aria-hidden />
        Kurs einstellen
      </button>
      {settings ? <CourseSettings course={course} semester={semester} onDone={() => setSettings(false)} /> : null}
    </section>
  );
}

function CourseSettings({ course, semester, onDone }: { course: CourseView; semester: Semester; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await updateGradeCourseAction(course.id, prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const [removing, start] = useTransition();
  const official = course.semesters[semester]?.official ? course.semesters[semester]!.points : null;
  return (
    <form action={action} className="mt-1 grid grid-cols-2 gap-3 rounded-[14px] bg-muted/60 p-3">
      <input type="hidden" name="semester" value={semester} />
      <div className="col-span-2 space-y-1.5 sm:col-span-1">
        <Label htmlFor={`subj-${course.id}`}>Fach</Label>
        <Input id={`subj-${course.id}`} name="subject" defaultValue={course.subject} maxLength={60} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`ck-${course.id}`}>Kursart</Label>
        <select id={`ck-${course.id}`} name="kind" defaultValue={course.kind} className={cn(select, "w-full")}>
          <option value="LK">Leistungskurs</option>
          <option value="GK">Grundkurs</option>
          <option value="SK">Seminarkurs</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`kw-${course.id}`}>Anteil Klausuren</Label>
        <select id={`kw-${course.id}`} name="klausurWeight" defaultValue={String(course.klausurWeight)} className={cn(select, "w-full")}>
          {[
            [0.3, "30 %"],
            [1 / 3, "33 % (ein Drittel)"],
            [0.4, "40 %"],
            [0.5, "50 % (Hälfte)"],
            [0.6, "60 %"],
            [2 / 3, "67 % (zwei Drittel)"],
          ].map(([v, l]) => (
            <option key={String(v)} value={String(v)}>
              {l}
            </option>
          ))}
          {![0.3, 1 / 3, 0.4, 0.5, 0.6, 2 / 3].includes(course.klausurWeight) ? (
            <option value={String(course.klausurWeight)}>{Math.round(course.klausurWeight * 100)} %</option>
          ) : null}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`tg-${course.id}`}>Ziel</Label>
        <select id={`tg-${course.id}`} name="target" defaultValue={course.target ?? ""} className={cn(select, "w-full")}>
          <option value="">kein Ziel</option>
          {POINTS.filter((p) => p >= 1).map((p) => (
            <option key={p} value={p}>
              {p} Punkte
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`of-${course.id}`}>Zeugnis {semester}</Label>
        <select id={`of-${course.id}`} name="official" defaultValue={official ?? ""} className={cn(select, "w-full")}>
          <option value="">noch keins (berechnen)</option>
          {POINTS.map((p) => (
            <option key={p} value={p}>
              {p} Punkte
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`es-${course.id}`}>Prüfungsfach</Label>
        <select id={`es-${course.id}`} name="examSlot" defaultValue={course.examSlot ?? ""} className={cn(select, "w-full")}>
          <option value="">keins</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}. Prüfungsfach
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`ee-${course.id}`}>Erwartet im Abi</Label>
        <select id={`ee-${course.id}`} name="examExpected" defaultValue={course.examExpected ?? ""} className={cn(select, "w-full")}>
          <option value="">schätzen</option>
          {POINTS.map((p) => (
            <option key={p} value={p}>
              {p} Punkte
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          Sichern
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto text-critical"
          disabled={removing}
          onClick={() => {
            if (confirm(`Kurs „${course.subject}“ mit allen Noten löschen?`)) start(() => deleteGradeCourseAction(course.id));
          }}
        >
          <Trash2 aria-hidden />
          Kurs löschen
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function AddCourseForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addGradeCourseAction, null);
  const [imported, setImported] = useState<FormState>(null);
  const [importing, start] = useTransition();
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-course">Fach</Label>
          <Input id="new-course" name="subject" maxLength={60} placeholder="z. B. Mathematik" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-kind">Kursart</Label>
          <select id="new-kind" name="kind" defaultValue="GK" className={select}>
            <option value="LK">LK</option>
            <option value="GK">GK</option>
            <option value="SK">Seminarkurs</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden />
          Anlegen
        </Button>
        <Status state={state} />
      </form>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button
          variant="outline"
          disabled={importing}
          onClick={() =>
            start(async () => {
              setImported(await importGradeCoursesAction());
            })
          }
        >
          <Download aria-hidden />
          {importing ? "Wird geladen …" : "Aus Stundenplan übernehmen"}
        </Button>
        <Status state={imported} />
      </div>
    </div>
  );
}
