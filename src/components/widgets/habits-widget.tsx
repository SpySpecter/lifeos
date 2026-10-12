import Link from "next/link";
import { loadHabits } from "@/integrations/loaders";
import { HabitList } from "../habit-list";
import { Progress } from "../ui/progress";
import { WidgetCard } from "../widget-card";

export async function HabitsWidget({ className }: { className?: string }) {
  const habits = await loadHabits(7);
  const done = habits.filter((h) => h.doneToday).length;
  return (
    <WidgetCard title="Gewohnheiten" href="/habits" className={className}>
      {habits.length ? (
        <div className="-my-2">
          <div className="flex items-center gap-3 pt-1 pb-3">
            <Progress value={(done / habits.length) * 100} className="flex-1 [&_[data-slot=progress-indicator]]:bg-good" aria-label="Heute erledigt" />
            <span className="text-subhead text-muted-foreground tabular-nums">
              {done === habits.length ? "Alles erledigt 🎉" : `${done} von ${habits.length}`}
            </span>
          </div>
          <HabitList habits={habits} />
        </div>
      ) : (
        <div className="py-2 text-subhead text-muted-foreground">
          <p>Noch keine Gewohnheiten.</p>
          <Link href="/habits" className="flex min-h-11 items-center font-semibold text-tint-text">
            Erste anlegen
          </Link>
        </div>
      )}
    </WidgetCard>
  );
}
