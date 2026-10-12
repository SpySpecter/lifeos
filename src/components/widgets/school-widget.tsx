import { currentDay, loadUntis } from "@/integrations/loaders";
import type { SchoolLesson } from "@/integrations/untis";
import { parseCourse } from "@/lib/courses";
import { addDays, DEFAULT_TZ, formatDayLong } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ResultView, WidgetCard } from "../widget-card";

function Status({ lesson, current }: { lesson: SchoolLesson; current: boolean }) {
  const pill = "shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold";
  if (lesson.status === "cancelled") return <span className={cn(pill, "bg-critical/12 text-critical")}>Entfall</span>;
  if (lesson.status === "irregular") return <span className={cn(pill, "bg-serious/12 text-serious")}>Änderung</span>;
  if (current) return <span className={cn(pill, "bg-primary text-primary-foreground")}>Jetzt</span>;
  return null;
}

export function LessonRow({ lesson, now }: { lesson: SchoolLesson; now: string | null }) {
  const cancelled = lesson.status === "cancelled";
  const current = now !== null && lesson.start <= now && now < lesson.end;
  const course = parseCourse(lesson.subject);
  const title = course.kind || !lesson.subjectLong ? course.title : lesson.subjectLong;
  return (
    <li className={cn("flex items-start gap-3 py-2.5", current && "-mx-2 rounded-[12px] bg-tint/10 px-2")}>
      <span className="w-[3.3em] shrink-0 pt-px text-subhead tabular-nums">
        <span className={cn("block font-semibold", cancelled && "text-muted-foreground")}>{lesson.start}</span>
        <span className="block text-footnote text-muted-foreground">{lesson.end}</span>
      </span>
      <span
        className={cn("w-1 shrink-0 self-stretch rounded-full", course.kind === "LK" ? "bg-[var(--cat-school)]" : "bg-muted", cancelled && "opacity-40")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-1.5 text-body font-semibold", cancelled && "text-muted-foreground line-through")}>
          <span className="truncate">{title}</span>
          {course.kind ? <span className="shrink-0 text-footnote font-medium text-muted-foreground">{course.kind}</span> : null}
        </p>
        <p className="truncate text-footnote text-muted-foreground">
          {[lesson.rooms.length ? `Raum ${lesson.rooms.join(", ")}` : null, lesson.teachers.join(", ")].filter(Boolean).join(" · ")}
        </p>
        {lesson.note ? <p className="mt-0.5 text-footnote">{lesson.note}</p> : null}
      </div>
      <Status lesson={lesson} current={current} />
    </li>
  );
}

export const dayHeading = (d: string, day: string) => (d === day ? "Heute" : d === addDays(day, 1) ? "Morgen" : formatDayLong(d));

/** Die nächsten Schultage (heute, solange noch Unterricht kommt). Auf der Schule-Seite: die ganze Woche. */
export async function SchoolWidget({
  className,
  days: count = 2,
  title = "Schule",
  href = "/schule",
}: {
  className?: string;
  days?: number;
  title?: string;
  href?: string | null;
}) {
  const [result, day] = await Promise.all([loadUntis(), currentDay()]);
  const nowTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_TZ }).format(new Date());
  return (
    <WidgetCard title={title} href={href ?? undefined} hrefLabel="Woche" className={className}>
      <ResultView result={result} integration="untis">
        {(week) => {
          const upcoming = week.days.filter(
            (d) => d.lessons.length && (d.day > day || (d.day === day && d.lessons.some((l) => l.end > nowTime))),
          );
          const shown = upcoming.slice(0, count);
          if (!shown.length) return <p className="py-2 text-subhead text-muted-foreground">Diese Woche kein Unterricht mehr. 🎉</p>;
          const laterChanges = week.changes.filter((c) => !shown.some((d) => d.day === c.day)).length;
          return (
            <div className="space-y-4">
              {shown.map((d) => (
                <div key={d.day}>
                  <h3 className="text-footnote font-semibold text-muted-foreground">{dayHeading(d.day, day)}</h3>
                  <ol className="ios-inset-rows [--inset:64px]">
                    {d.lessons.map((l) => (
                      <LessonRow key={`${l.day}-${l.start}-${l.subject}`} lesson={l} now={d.day === day ? nowTime : null} />
                    ))}
                  </ol>
                </div>
              ))}
              {laterChanges ? (
                <p className="text-footnote text-muted-foreground">
                  + {laterChanges} {laterChanges === 1 ? "weitere Änderung" : "weitere Änderungen"} diese Woche
                </p>
              ) : null}
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
