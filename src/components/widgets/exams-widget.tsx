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

/** Tage-Kachel im Kleinen: dieselbe Form wie oben auf der Heute-Seite. */
function Countdown({ days }: { days: number }) {
  const u = urgency(days);
  return (
    <div
      className={cn(
        "grid h-14 w-14 shrink-0 place-content-center rounded-[14px] text-center",
        u === "critical" && "bg-critical/12 text-critical",
        u === "warning" && "bg-warning/15 text-warning",
        u === "calm" && "bg-muted",
      )}
    >
      {days <= 1 ? (
        <span className="text-subhead font-bold">{countdownLabel(days)}</span>
      ) : (
        <>
          <span className="font-heading text-title2 leading-none font-bold tabular-nums">{days}</span>
          <span className="text-caption2 font-medium text-muted-foreground">Tage</span>
        </>
      )}
    </div>
  );
}

function ExamRow({ exam, days }: { exam: Exam; days: number }) {
  const body = (
    <div className="flex items-center gap-3 py-2.5">
      <Countdown days={days} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-body font-semibold">
          <span className="truncate">{exam.label}</span>
          {exam.course ? <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-caption font-semibold text-muted-foreground">{exam.course}</span> : null}
        </p>
        <p className="truncate text-footnote text-muted-foreground">
          {exam.kind} · {dateLabel(exam)}
          {exam.topic ? ` · ${exam.topic}` : ""}
        </p>
      </div>
    </div>
  );
  return (
    <li>
      {exam.url ? (
        <a href={exam.url} target="_blank" rel="noreferrer" className="block active:opacity-60">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

export async function ExamsWidget({
  className,
  limit = 4,
  href = "/schule#klausuren",
}: {
  className?: string;
  limit?: number;
  href?: string | null;
}) {
  const [result, day] = await Promise.all([loadExams(), currentDay()]);
  return (
    <WidgetCard title="Klausuren & Tests" className={className} href={href ?? undefined} action={<RefreshButton integration="exams" />}>
      <ResultView result={result} integration="exams">
        {(list) =>
          list.length ? (
            <ul className="-my-2.5 ios-inset-rows [--inset:68px]">
              {list.slice(0, limit).map((x) => (
                <ExamRow key={x.id} exam={x} days={daysUntil(x.day, day)} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-subhead text-muted-foreground">
              Keine Klausuren oder Tests in den nächsten 6 Monaten. Termine mit „Klausur“ oder „Test“ im Titel erscheinen hier automatisch.
            </p>
          )
        }
      </ResultView>
    </WidgetCard>
  );
}
