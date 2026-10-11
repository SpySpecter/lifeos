import { NotebookPen } from "lucide-react";
import type { Exam } from "@/integrations/exams";
import { daysUntil } from "@/integrations/exams";
import { currentDay, loadExams } from "@/integrations/loaders";
import { cn } from "@/lib/utils";
import { RefreshButton } from "../refresh-button";
import { ResultView, WidgetCard } from "../widget-card";

export function countdownLabel(days: number): string {
  return days <= 0 ? "Heute" : days === 1 ? "Morgen" : `in ${days} Tagen`;
}

/** Dringlichkeit: ≤ 2 Tage kritisch, ≤ 7 Tage Warnung – immer zusammen mit Text, nie nur Farbe. */
const urgency = (days: number) => (days <= 2 ? "critical" : days <= 7 ? "warning" : "calm");

const dateLabel = (x: Exam) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${x.day}T12:00:00Z`)) +
  (x.start ? ` · ${x.start}${x.end ? `–${x.end}` : ""}` : "") +
  (x.detail ? ` · ${x.detail}` : "");

function ExamRow({ exam, days }: { exam: Exam; days: number }) {
  const u = urgency(days);
  const body = (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "grid w-14 shrink-0 place-items-center rounded-lg py-1.5 text-center ring-1",
          u === "critical" && "bg-critical/12 ring-critical/40",
          u === "warning" && "bg-warning/12 ring-warning/40",
          u === "calm" && "bg-muted ring-transparent",
        )}
      >
        {days <= 1 ? (
          <span className="text-xs font-semibold">{countdownLabel(days)}</span>
        ) : (
          <>
            <span className="text-lg leading-none font-semibold tabular-nums">{days}</span>
            <span className="text-[10px] text-muted-foreground">Tage</span>
          </>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {exam.label}
          {exam.course ? <span className="ml-1.5 rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">{exam.course}</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {exam.kind} · {dateLabel(exam)}
          {exam.topic ? ` · ${exam.topic}` : ""}
        </p>
      </div>
    </div>
  );
  return (
    <li>
      {exam.url ? (
        <a href={exam.url} target="_blank" rel="noreferrer" className="block rounded-lg hover:bg-muted/60">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

export async function ExamsWidget({ className }: { className?: string }) {
  const [result, day] = await Promise.all([loadExams(), currentDay()]);
  return (
    <WidgetCard title="Klausuren & Tests" icon={NotebookPen} className={className} action={<RefreshButton integration="exams" />}>
      <ResultView result={result} integration="exams">
        {(list) =>
          list.length ? (
            <ul className="space-y-2.5">
              {list.slice(0, 5).map((x) => (
                <ExamRow key={x.id} exam={x} days={daysUntil(x.day, day)} />
              ))}
              {list.length > 5 ? <li className="text-xs text-muted-foreground">+ {list.length - 5} weitere</li> : null}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              Keine Klausuren oder Tests in den nächsten 6 Monaten. Termine mit „Klausur“ oder „Test“ im Titel erscheinen hier automatisch.
            </p>
          )
        }
      </ResultView>
    </WidgetCard>
  );
}
