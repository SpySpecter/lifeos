import { CalendarX2, CloudSun, GraduationCap, NotebookPen } from "lucide-react";
import type { ReactNode } from "react";
import { currentDay, loadExams, loadSettings, loadUntis, loadWeather } from "@/integrations/loaders";
import { changesText, type ChipText, nextExamText, nextLessonText, weatherText } from "@/lib/hero";
import { formatDayLong, formatTime, greeting } from "@/lib/time";
import { cn } from "@/lib/utils";

const OFF: ChipText = { value: "Nicht verbunden", tone: "normal" };
const ERR: ChipText = { value: "Gerade nicht erreichbar", tone: "normal" };

function Chip({ icon, label, text, href }: { icon: ReactNode; label: string; text: ChipText; href: string }) {
  return (
    <a
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-xl bg-card px-2.5 py-2 ring-1 ring-foreground/8 transition-colors hover:bg-muted/60 active:bg-muted sm:gap-3 sm:px-3 sm:py-2.5"
    >
      <span
        className={cn(
          "hidden size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground min-[400px]:grid",
          text.tone === "warning" && "bg-warning/15 text-foreground",
          text.tone === "critical" && "bg-critical/15 text-critical",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="line-clamp-2 text-[13px] leading-snug font-medium sm:truncate sm:text-sm">{text.value}</p>
      </div>
    </a>
  );
}

export async function TodayHero() {
  const [day, untis, examList, weather, settings] = await Promise.all([currentDay(), loadUntis(), loadExams(), loadWeather(), loadSettings()]);
  const now = new Date();
  const nowTime = formatTime(now);

  const school = untis.status === "ok" ? untis.data : null;
  const lesson = school ? nextLessonText(school, day, nowTime) : untis.status === "unconfigured" ? OFF : ERR;
  const changes = school ? changesText(school, day) : untis.status === "unconfigured" ? OFF : ERR;
  const exam = examList.status === "ok" ? nextExamText(examList.data, day) : examList.status === "unconfigured" ? OFF : ERR;
  const wx = weather.result.status === "ok" ? weatherText(weather.result.data) : ERR;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{formatDayLong(day)}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(now)}{settings.displayName ? `, ${settings.displayName}` : ""} 👋</h1>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Chip href="#schule" icon={<GraduationCap className="size-4" />} label="Nächste Stunde" text={lesson} />
        <Chip href="#schule" icon={<CalendarX2 className="size-4" />} label="Ausfälle & Vertretungen" text={changes} />
        <Chip href="#klausuren" icon={<NotebookPen className="size-4" />} label="Nächste Klausur" text={exam} />
        <Chip href="#wetter" icon={<CloudSun className="size-4" />} label="Wetter" text={wx} />
      </div>
    </section>
  );
}

export function TodayHeroSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-xl bg-card ring-1 ring-foreground/8" />
        ))}
      </div>
    </section>
  );
}
