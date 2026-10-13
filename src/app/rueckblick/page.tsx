import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ReviewRefresh } from "@/components/review-refresh";
import { StudyBars } from "@/components/study-bars";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { currentDay } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatNote } from "@/lib/grades";
import { formatMinutes } from "@/lib/study";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";
import { defaultWeek, getOrCreateReview, weekLabel, weekStartOf, type WeeklyReview } from "@/lib/weekly-review";

export const metadata: Metadata = { title: "Wochenrückblick" };

const num = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const pct = (x: number) => `${Math.round(x * 100)} %`;

function Tile({ label, value, unit, caption, tone }: { label: string; value: string; unit?: string; caption: string; tone?: "good" | "warning" }) {
  return (
    <div className="flex min-h-28 flex-col rounded-[20px] bg-card p-4">
      <p className="text-footnote font-semibold">{label}</p>
      <p className={cn("mt-auto pt-2 font-heading text-title1 leading-none font-bold tracking-tight tabular-nums", tone === "warning" && "text-warning")}>
        {value}
        {unit ? <span className="ml-1 text-footnote font-semibold text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="mt-1 text-footnote text-muted-foreground">{caption}</p>
    </div>
  );
}

function Tiles({ r }: { r: WeeklyReview }) {
  const diff = r.studyActual - r.studyActualPrev;
  const sleepDiff = r.sleep.avg !== null && r.sleep.prevAvg !== null ? r.sleep.avg - r.sleep.prevAvg : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Gewohnheiten"
        value={r.habitRate === null ? "–" : pct(r.habitRate)}
        caption={r.habits.length ? `${r.habits.reduce((n, h) => n + h.covered, 0)} von ${r.habits.reduce((n, h) => n + h.days, 0)} Habit-Tagen` : "Keine angelegt"}
        tone={r.habitRate !== null && r.habitRate < 0.5 ? "warning" : undefined}
      />
      <Tile
        label="Lernzeit"
        value={formatMinutes(r.studyActual)}
        caption={`${r.studyPlanned ? `von ${formatMinutes(r.studyPlanned)} geplant · ` : ""}${diff >= 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))} zur Vorwoche`}
      />
      <Tile label="Karteikarten" value={String(r.cards.reviews)} unit="Antworten" caption={r.cards.reviews ? `${pct(r.cards.known / r.cards.reviews)} gewusst · ${r.cards.cards} Karten` : "Diese Woche nichts wiederholt"} />
      <Tile
        label="Schlaf"
        value={r.sleep.avg === null ? "–" : num(r.sleep.avg)}
        unit={r.sleep.avg === null ? undefined : "h Ø"}
        caption={r.sleep.avg === null ? "Keine Daten" : `Ziel ${num(r.sleep.goal)} h${sleepDiff !== null ? ` · ${sleepDiff >= 0 ? "+" : "−"}${num(Math.abs(sleepDiff))} h zur Vorwoche` : ""}`}
        tone={r.sleep.avg !== null && r.sleep.avg < r.sleep.goal - 0.5 ? "warning" : undefined}
      />
    </div>
  );
}

async function ReviewContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const day = await currentDay();
  const raw = (await searchParams).woche;
  const current = weekStartOf(day);
  const week = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= current ? weekStartOf(raw) : defaultWeek(day);
  const tz = env().APP_TZ;
  const r = await getOrCreateReview(db(), week, day, tz);
  const running = r.until < addDays(week, 6);
  const next = addDays(week, 7);
  return (
    <>
      <PageHeader eyebrow={weekLabel(week)} title="Wochenrückblick" trailing={<ReviewRefresh week={week} />} />
      <nav aria-label="Woche wechseln" className="flex items-center justify-between">
        <Link href={`/rueckblick?woche=${addDays(week, -7)}`} className="flex min-h-11 items-center gap-0.5 rounded-full pr-3 text-body text-tint-text active:opacity-60">
          <ChevronLeft className="size-5" aria-hidden />
          Vorwoche
        </Link>
        {running ? <span className="text-footnote text-muted-foreground">läuft noch – Stand {new Date(`${r.until}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" })}</span> : null}
        {next <= current ? (
          <Link href={`/rueckblick?woche=${next}`} className="flex min-h-11 items-center gap-0.5 rounded-full pl-3 text-body text-tint-text active:opacity-60">
            Nächste
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        ) : (
          <span className="w-24" />
        )}
      </nav>

      {r.comment ? (
        <section className="rounded-[20px] bg-card p-4">
          <p className="flex items-center gap-1.5 text-footnote font-semibold text-muted-foreground">
            {r.ai ? <Sparkles className="size-4 text-tint" aria-hidden /> : null}
            {r.ai ? "Kommentar der KI" : "Kurz gesagt"}
          </p>
          <h2 className="mt-1 text-title2 font-bold tracking-tight">{r.comment.headline}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {r.comment.good.length ? (
              <div>
                <p className="text-subhead font-semibold text-good">Lief gut</p>
                <ul className="mt-1 space-y-1 text-body">
                  {r.comment.good.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span aria-hidden>✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {r.comment.next.length ? (
              <div>
                <p className="text-subhead font-semibold text-tint-text">Nächste Woche</p>
                <ul className="mt-1 space-y-1 text-body">
                  {r.comment.next.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span aria-hidden>→</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <Tiles r={r} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
        <div className="space-y-6">
          <WidgetCard title="Gewohnheiten" href="/habits" hrefLabel="Habits">
            {r.habits.length ? (
              <ul className="-my-1 ios-rows">
                {r.habits.map((h) => (
                  <li key={h.name} className="flex min-h-11 items-center gap-3 py-1.5">
                    <span className="text-title3 leading-none" aria-hidden>
                      {h.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{h.name}</span>
                      <span className="mt-1 block h-1.5 rounded-full bg-muted" aria-hidden>
                        <span className="block h-1.5 rounded-full bg-good" style={{ width: `${(h.covered / h.days) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-16 shrink-0 text-right text-subhead text-muted-foreground tabular-nums">
                      {h.covered}/{h.days}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-subhead text-muted-foreground">Keine Gewohnheiten.</p>
            )}
          </WidgetCard>
          {r.exams?.length ? (
            <WidgetCard title="Nächste Woche" href="/schule#klausuren" hrefLabel="Klausuren">
              <ul className="-my-1 ios-rows">
                {r.exams.map((x) => (
                  <li key={`${x.label}-${x.day}`} className="flex min-h-11 items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-body">
                      {x.label} {x.course ? <span className="text-footnote text-muted-foreground">{x.course}</span> : null}
                    </span>
                    <span className="text-subhead text-muted-foreground">
                      {new Date(`${x.day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" })}
                    </span>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          ) : null}
        </div>
        <div className="space-y-6">
          <WidgetCard title="Lernzeit pro Fach" href="/lernen" hrefLabel="Lernen" footer={r.study.length ? "Balken: mit dem Fokus-Timer gemessen · grau: laut Lernplan geplant." : undefined}>
            {r.study.length ? <StudyBars rows={r.study} /> : <p className="text-subhead text-muted-foreground">Nichts geplant oder gemessen.</p>}
          </WidgetCard>
          <WidgetCard title="Noten" href="/noten" hrefLabel="Alle">
            {r.grades.length ? (
              <ul className="-my-1 ios-rows">
                {r.grades.map((g, i) => (
                  <li key={i} className="flex min-h-11 items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-body">
                      {g.subject} <span className="text-footnote text-muted-foreground">{g.label ?? g.kind}</span>
                    </span>
                    <span className={cn("text-body font-semibold tabular-nums", g.points < 5 && "text-critical")}>{g.points} P.</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-subhead text-muted-foreground">Diese Woche keine neuen Noten.</p>
            )}
            {r.abiNote !== null ? <p className="mt-3 border-t border-border pt-2 text-subhead text-muted-foreground tabular-nums">Abi-Hochrechnung: {formatNote(r.abiNote)}</p> : null}
          </WidgetCard>
        </div>
      </div>
    </>
  );
}

// Woche als Query-Parameter (?woche=Montag), damit die Navigation im Layout vorgerendert bleibt.
export default function ReviewPage({ searchParams }: PageProps<"/rueckblick">) {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Wochenrückblick" />
            <WidgetSkeleton lines={8} />
          </>
        }
      >
        <ReviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
