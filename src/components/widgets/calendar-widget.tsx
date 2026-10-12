import { MapPin } from "lucide-react";
import { currentDay, loadGoogle } from "@/integrations/loaders";
import type { CalendarEvent } from "@/integrations/google";
import { addDays, dayString, formatDayLong, formatTime } from "@/lib/time";
import { ResultView, WidgetCard } from "../widget-card";

const eventDay = (e: CalendarEvent) => (e.allDay ? e.start.slice(0, 10) : dayString(new Date(e.start)));

export async function CalendarWidget({ className }: { className?: string }) {
  const [result, day] = await Promise.all([loadGoogle(), currentDay()]);
  return (
    <WidgetCard title="Termine" className={className}>
      <ResultView result={result} integration="google">
        {({ events }) => {
          if (!events.length) return <p className="py-2 text-subhead text-muted-foreground">Keine Termine in den nächsten 7 Tagen.</p>;
          const groups = new Map<string, CalendarEvent[]>();
          for (const e of events.slice(0, 10)) {
            const d = eventDay(e) < day ? day : eventDay(e); // laufende mehrtägige Termine unter „Heute“
            groups.set(d, [...(groups.get(d) ?? []), e]);
          }
          return (
            <div className="space-y-4">
              {[...groups].map(([d, list]) => (
                <div key={d}>
                  <h3 className="mb-1.5 text-footnote font-semibold text-muted-foreground">
                    {d === day ? "Heute" : d === addDays(day, 1) ? "Morgen" : formatDayLong(d)}
                  </h3>
                  <ul className="space-y-2 text-subhead">
                    {list.map((e) => (
                      <li key={e.id} className="flex gap-3">
                        <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ background: e.color ?? "var(--series-1)" }} aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {e.url && e.url !== "#" ? (
                              <a href={e.url} target="_blank" rel="noreferrer" className="active:opacity-70">
                                {e.title}
                              </a>
                            ) : (
                              e.title
                            )}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-2 text-footnote text-muted-foreground">
                            <span>{e.allDay ? "Ganztägig" : `${formatTime(e.start)}–${formatTime(e.end)}`}</span>
                            <span>{e.calendar}</span>
                            {e.location ? (
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="size-3" aria-hidden />
                                {e.location}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
