import { GraduationCap } from "lucide-react";
import { currentDay, loadUntis } from "@/integrations/loaders";
import type { SchoolLesson } from "@/integrations/untis";
import { formatDayLong } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { ResultView, WidgetCard } from "../widget-card";

function LessonRow({ lesson, now }: { lesson: SchoolLesson; now: string | null }) {
  const cancelled = lesson.status === "cancelled";
  const current = now !== null && lesson.start <= now && now < lesson.end;
  return (
    <li
      className={cn(
        "grid grid-cols-[3.25rem_1fr_auto] items-start gap-3 rounded-lg px-2 py-1.5",
        current && "bg-series-1/10 ring-1 ring-series-1/30",
      )}
    >
      <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">
        {lesson.start}
        <br />
        {lesson.end}
      </span>
      <div className="min-w-0">
        <p className={cn("truncate font-medium", cancelled && "text-muted-foreground line-through")}>
          {lesson.subjectLong ?? lesson.subject}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[lesson.rooms.join(", "), lesson.teachers.join(", ")].filter(Boolean).join(" · ")}
        </p>
        {lesson.note ? <p className="mt-0.5 text-xs">{lesson.note}</p> : null}
      </div>
      {cancelled ? (
        <Badge variant="outline" className="border-critical/40 text-critical">
          Entfall
        </Badge>
      ) : lesson.status === "irregular" ? (
        <Badge variant="outline" className="border-serious/50 text-serious">
          Änderung
        </Badge>
      ) : current ? (
        <Badge variant="outline">Jetzt</Badge>
      ) : null}
    </li>
  );
}

export async function SchoolWidget({ className }: { className?: string }) {
  const [result, day] = await Promise.all([loadUntis(), currentDay()]);
  const nowTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date());
  return (
    <WidgetCard title="Schule" icon={GraduationCap} className={className}>
      <ResultView result={result} integration="untis">
        {(week) => {
          // Heute, solange noch Unterricht kommt – sonst der nächste Schultag
          const upcoming = week.days.filter(
            (d) => d.lessons.length && (d.day > day || (d.day === day && d.lessons.some((l) => l.end > nowTime))),
          );
          const shown = upcoming.slice(0, 2);
          if (!shown.length) return <p className="py-6 text-sm text-muted-foreground">Diese Woche kein Unterricht mehr. 🎉</p>;
          return (
            <div className="space-y-4">
              {shown.map((d) => (
                <div key={d.day}>
                  <h3 className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {d.day === day ? "Heute" : formatDayLong(d.day)}
                  </h3>
                  <ol className="space-y-0.5 text-sm">
                    {d.lessons.map((l) => (
                      <LessonRow key={`${l.day}-${l.start}-${l.subject}`} lesson={l} now={d.day === day ? nowTime : null} />
                    ))}
                  </ol>
                </div>
              ))}
              {week.changes.filter((c) => !shown.some((d) => d.day === c.day)).length ? (
                <p className="px-2 text-xs text-muted-foreground">
                  + {week.changes.filter((c) => !shown.some((d) => d.day === c.day)).length} weitere Änderungen diese Woche
                </p>
              ) : null}
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
