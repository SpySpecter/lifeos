import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PlanActions, StudySessionList } from "@/components/study";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { currentDay } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { examCountdown, getMaterials, getPlan, type StudySession } from "@/lib/study";
import { formatDayLong } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lernplan" };

/** Einheiten nach Woche gruppieren (Montag als Wochenbeginn), damit lange Pläne übersichtlich bleiben. */
function byWeek(sessions: StudySession[]): { label: string; sessions: StudySession[] }[] {
  const weeks = new Map<string, StudySession[]>();
  for (const s of sessions) {
    const d = new Date(`${s.day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) ?? []), s]);
  }
  return [...weeks].map(([monday, list]) => ({
    label: `Woche ab ${new Date(`${monday}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "long", timeZone: "UTC" })}`,
    sessions: list,
  }));
}

async function PlanContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const day = await currentDay();
  const planId = Number((await searchParams).id);
  const plan = Number.isInteger(planId) && planId > 0 ? getPlan(db(), planId) : null;
  if (!plan) notFound();
  const c = examCountdown(plan.examDay, day);
  const materials = getMaterials(db(), plan.materialIds).map((m) => m.title);
  const minutes = plan.sessions.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0);
  return (
    <>
      <PageHeader title={plan.title} back={{ href: "/lernen", label: "Lernen" }} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          {byWeek(plan.sessions).map((w) => (
            <WidgetCard key={w.label} title={w.label}>
              <StudySessionList sessions={w.sessions} showDay />
            </WidgetCard>
          ))}
        </div>
        <WidgetCard title="Überblick">
          <dl className="-my-2 ios-rows text-body">
            {[
              ["Klausur", <>{formatDayLong(plan.examDay)} · <span className={cn("font-semibold", c.tone)}>{c.text}</span></>],
              ["Kurs / Thema", plan.subject ?? "–"],
              ["Fortschritt", `${plan.done} von ${plan.total} Einheiten`],
              ["Noch offen", `${minutes} Min.`],
              ["Material", materials.length ? materials.join(", ") : "keins"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-3 py-2.5">
                <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 flex-1">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <PlanActions planId={plan.id} title={plan.title} archived={plan.archived} />
          </div>
        </WidgetCard>
      </div>
    </>
  );
}

// Plan-ID als Query-Parameter statt dynamischem Segment: so bleibt die Navigation im Layout vorgerendert.
export default function PlanPage({ searchParams }: PageProps<"/lernen/plan">) {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Lernplan" back={{ href: "/lernen", label: "Lernen" }} />
            <WidgetSkeleton lines={8} />
          </>
        }
      >
        <PlanContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
