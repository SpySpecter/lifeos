import Link from "next/link";
import { ListChecks } from "lucide-react";
import { loadHabits } from "@/integrations/loaders";
import { HabitList } from "../habit-list";
import { Progress } from "../ui/progress";
import { WidgetCard } from "../widget-card";

export async function HabitsWidget({ className }: { className?: string }) {
  const habits = await loadHabits(7);
  const done = habits.filter((h) => h.doneToday).length;
  return (
    <WidgetCard title="Gewohnheiten" icon={ListChecks} href="/habits" className={className}>
      {habits.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <Progress value={(done / habits.length) * 100} className="flex-1" aria-label="Heute erledigt" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {done}/{habits.length} heute
            </span>
          </div>
          <HabitList habits={habits} />
        </div>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          Noch keine Gewohnheiten.{" "}
          <Link href="/habits" className="font-medium text-foreground underline underline-offset-4">
            Erste anlegen
          </Link>
        </p>
      )}
    </WidgetCard>
  );
}
