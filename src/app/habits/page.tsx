import type { Metadata } from "next";
import { Suspense } from "react";
import { HabitActionButton } from "@/components/habit-actions";
import { HabitForm, HabitManageList } from "@/components/habit-form";
import { HabitList } from "@/components/habit-list";
import { Heatmap } from "@/components/heatmap";
import { SettingsLink } from "@/components/nav";
import { PageHeader } from "@/components/page-header";
import { PushSettings } from "@/components/push-settings";
import { Progress } from "@/components/ui/progress";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { currentDay, loadHabits } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { habitHeatmap, listArchivedHabits } from "@/lib/habits";
import { countSubscriptions, vapidKeys } from "@/lib/push";

export const metadata: Metadata = { title: "Gewohnheiten" };

function PushSection() {
  let publicKey: string;
  try {
    publicKey = vapidKeys(db()).publicKey;
  } catch (err) {
    return <p className="text-subhead text-critical">Mitteilungen nicht verfügbar: {(err as Error).message}</p>;
  }
  return <PushSettings publicKey={publicKey} devices={countSubscriptions(db())} />;
}

async function HabitsContent() {
  const [habits, day] = await Promise.all([loadHabits(30), currentDay()]);
  const heat = habitHeatmap(db(), day, 16 * 7);
  const archived = listArchivedHabits(db());
  const done = habits.filter((h) => h.doneToday).length;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start [&>*]:min-w-0">
      <div className="space-y-6">
        <WidgetCard title="Heute">
          {habits.length ? (
            <div className="-my-2">
              <div className="flex items-center gap-3 pt-1 pb-3">
                <Progress value={(done / habits.length) * 100} className="flex-1 [&_[data-slot=progress-indicator]]:bg-good" aria-label="Heute erledigt" />
                <span className="text-subhead text-muted-foreground tabular-nums">
                  {done === habits.length ? "Alles erledigt 🎉" : `${done} von ${habits.length}`}
                </span>
              </div>
              <HabitList habits={habits.map((h) => ({ ...h, history: h.history.slice(-7) }))} />
            </div>
          ) : (
            <p className="text-subhead text-muted-foreground">Noch keine Gewohnheiten – leg unten die erste an.</p>
          )}
          <div className="mt-3 border-t border-border pt-2">
            <HabitForm />
          </div>
        </WidgetCard>

        <WidgetCard title="Erinnerungen">
          <PushSection />
        </WidgetCard>
      </div>

      <div className="space-y-6">
        {habits.length ? (
          <WidgetCard
            title="Verwalten"
            footer="Am Griff ziehen zum Sortieren, nach links wischen für Bearbeiten, Archivieren und Löschen. Balken: erledigt an den letzten 30 Tagen."
          >
            <HabitManageList
              habits={habits.map((h) => ({
                id: h.id,
                name: h.name,
                emoji: h.emoji,
                remindAt: h.remindAt,
                rate: h.history.filter((d) => d.done).length / h.history.length,
              }))}
            />
          </WidgetCard>
        ) : null}

        <WidgetCard title="Letzte 16 Wochen">
          <Heatmap
            cells={heat.map((h) => ({ day: h.day, value: h.count, max: h.total }))}
            label="Erledigte Gewohnheiten pro Tag, letzte 16 Wochen"
            unit={(v) => `${v} erledigt`}
            cell="size-3.5 sm:size-4"
          />
        </WidgetCard>

        {archived.length ? (
          <WidgetCard title={`Archiv (${archived.length})`}>
            <ul className="-my-2 ios-inset-rows [--inset:36px]">
              {archived.map((h) => (
                <li key={h.id} className="flex min-h-12 items-center gap-3">
                  <span className="text-title3 leading-none" aria-hidden>
                    {h.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{h.name}</span>
                    <span className="text-footnote text-muted-foreground tabular-nums">{h.checks}× erledigt</span>
                  </span>
                  <HabitActionButton kind="restore" id={h.id} name={h.name} />
                  <HabitActionButton kind="delete" id={h.id} name={h.name} />
                </li>
              ))}
            </ul>
          </WidgetCard>
        ) : null}
      </div>
    </div>
  );
}

export default function HabitsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Gewohnheiten" trailing={<SettingsLink className="desktop:hidden" />} />
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <HabitsContent />
      </Suspense>
    </div>
  );
}
