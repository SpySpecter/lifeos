import { currentDay, loadUntis } from "@/integrations/loaders";
import { ResultView, WidgetCard } from "../widget-card";
import { dayHeading, LessonRow } from "./school-widget";

/** Alle Ausfälle und Vertretungen der Woche, nach Tag gruppiert. */
export async function SchoolChanges({ className }: { className?: string }) {
  const [result, day] = await Promise.all([loadUntis(), currentDay()]);
  return (
    <WidgetCard title="Ausfälle & Änderungen" className={className}>
      <ResultView result={result} integration="untis">
        {(week) => {
          const upcoming = week.changes.filter((c) => c.day >= day);
          if (!upcoming.length) return <p className="py-2 text-subhead text-muted-foreground">Diese Woche läuft alles nach Plan.</p>;
          const days = [...new Set(upcoming.map((c) => c.day))];
          return (
            <div className="space-y-4">
              {days.map((d) => (
                <div key={d}>
                  <h3 className="text-footnote font-semibold text-muted-foreground">{dayHeading(d, day)}</h3>
                  <ol className="ios-inset-rows [--inset:64px]">
                    {upcoming
                      .filter((c) => c.day === d)
                      .map((l) => (
                        <LessonRow key={`${l.day}-${l.start}-${l.subject}`} lesson={l} now={null} />
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
