import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SettingsLink } from "@/components/nav";
import { PageHeader } from "@/components/page-header";
import { FlashcardSetView, MaterialRow, MaterialUpload, StudyPlanForm, StudySessionList, type CostInfo } from "@/components/study";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { upcoming } from "@/integrations/exams";
import { currentDay, loadExams } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { env, isDemo } from "@/lib/env";
import { costUsd } from "@/lib/openai";
import { examCountdown, listFlashcardSets, listMaterials, listPlans, MAX_CONTEXT_CHARS, todaysSessions, type StudyPlan } from "@/lib/study";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lernen" };

const Empty = ({ children }: { children: string }) => <p className="py-1 text-subhead text-muted-foreground">{children}</p>;

function costInfo(): CostInfo {
  const model = env().OPENAI_MODEL;
  return { priceIn: costUsd(model, 1_000_000, 0), priceOut: costUsd(model, 0, 1_000_000), maxChars: MAX_CONTEXT_CHARS, demo: isDemo() };
}

async function TodayCard() {
  const day = await currentDay();
  const sessions = todaysSessions(db(), day);
  const open = sessions.filter((s) => !s.done);
  return (
    <WidgetCard
      title="Heute lernen"
      footer={sessions.length ? `${open.length ? `${open.reduce((n, s) => n + s.minutes, 0)} Min. offen` : "Alles geschafft 🎉"} · Tippen oder nach rechts wischen zum Abhaken.` : undefined}
    >
      {sessions.length ? <StudySessionList sessions={sessions} showPlan /> : <Empty>Heute steht nichts an.</Empty>}
    </WidgetCard>
  );
}

function PlanRow({ plan, day }: { plan: StudyPlan; day: string }) {
  const c = examCountdown(plan.examDay, day);
  const pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
  return (
    <li>
      <Link href={`/lernen/plan?id=${plan.id}`} className="-mx-4 flex items-center gap-3 px-4 py-3 active:bg-muted">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">
            {plan.title}
            {plan.subject ? <span className="ml-1.5 text-footnote font-medium text-muted-foreground">{plan.subject}</span> : null}
          </p>
          <div className="mt-1 flex items-center gap-2 text-footnote text-muted-foreground tabular-nums">
            <span className="h-1.5 w-20 rounded-full bg-muted" aria-hidden>
              <span className="block h-1.5 rounded-full bg-good" style={{ width: `${pct}%` }} />
            </span>
            {plan.done}/{plan.total} Einheiten
          </div>
        </div>
        <span className={cn("shrink-0 text-subhead font-semibold tabular-nums", c.tone)}>{c.text}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
      </Link>
    </li>
  );
}

async function PlansCard() {
  const day = await currentDay();
  const plans = listPlans(db());
  const archived = listPlans(db(), { archived: true });
  return (
    <WidgetCard title="Lernpläne" footer={archived.length ? `${archived.length} archiviert – über den jeweiligen Plan wiederherstellbar.` : undefined}>
      {plans.length ? (
        <ul className="-my-3 ios-rows">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} day={day} />
          ))}
        </ul>
      ) : (
        <Empty>Noch kein Lernplan – unten einen erstellen.</Empty>
      )}
      {archived.length ? (
        <details className="mt-3 border-t border-border pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-subhead text-tint-text">Archiv</summary>
          <ul className="ios-rows">
            {archived.map((p) => (
              <PlanRow key={p.id} plan={p} day={day} />
            ))}
          </ul>
        </details>
      ) : null}
    </WidgetCard>
  );
}

async function NewPlanCard() {
  const day = await currentDay();
  const exams = await loadExams();
  const options = exams.status === "ok" ? upcoming(exams.data, addDays(day, 1)).slice(0, 15).map(({ id, label, course, day }) => ({ id, label, course, day })) : [];
  const materials = listMaterials(db()).map(({ id, title, subject, chars }) => ({ id, title, subject, chars }));
  return (
    <WidgetCard title="Neuer Lernplan" footer="Die KI verteilt die Themen aus deinem Material bis zum Vortag der Klausur – mit Wiederholungen und Generalprobe am Ende.">
      <StudyPlanForm exams={options} materials={materials} minDay={addDays(day, 1)} cost={costInfo()} />
    </WidgetCard>
  );
}

async function MaterialsCard() {
  await currentDay();
  const materials = listMaterials(db());
  const cost = costInfo();
  return (
    <WidgetCard title="Materialien" footer="PDFs vorher in Markdown umwandeln – das spart gegenüber PDFs viele Token.">
      <MaterialUpload />
      {materials.length ? (
        <ul className="mt-3 ios-rows border-t border-border">
          {materials.map((m) => (
            <MaterialRow key={m.id} material={m} cost={cost} />
          ))}
        </ul>
      ) : null}
    </WidgetCard>
  );
}

async function FlashcardsCard() {
  await currentDay();
  const sets = listFlashcardSets(db());
  return (
    <WidgetCard title="Karteikarten" footer="RemNote-Format „Frage == Antwort“, eine Karte pro Zeile – kopieren und direkt in RemNote einfügen.">
      {sets.length ? (
        <ul className="-my-3 ios-rows">
          {sets.map((s) => (
            <FlashcardSetView
              key={s.id}
              set={{
                id: s.id,
                title: s.title,
                content: s.content,
                cards: s.cards,
                created: new Date(s.createdAt).toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: env().APP_TZ }),
              }}
            />
          ))}
        </ul>
      ) : (
        <Empty>Noch keine Karteikarten – bei einem Material auf „Karteikarten“ tippen.</Empty>
      )}
    </WidgetCard>
  );
}

export default function LearnPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Lernen" trailing={<SettingsLink className="sm:hidden" />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Suspense fallback={<WidgetSkeleton lines={4} />}>
            <TodayCard />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton lines={4} />}>
            <PlansCard />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton lines={8} />}>
            <NewPlanCard />
          </Suspense>
        </div>
        <div className="space-y-6">
          <Suspense fallback={<WidgetSkeleton lines={6} />}>
            <MaterialsCard />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton lines={6} />}>
            <FlashcardsCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
