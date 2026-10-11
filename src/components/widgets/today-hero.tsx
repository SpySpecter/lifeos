import { CalendarClock, GraduationCap, ListChecks, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { currentDay, loadGoogle, loadHabits, loadUntis } from "@/integrations/loaders";
import { formatDayLong, formatTime, greeting } from "@/lib/time";

function Chip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/8">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export async function TodayHero() {
  const [day, untis, google, habits] = await Promise.all([currentDay(), loadUntis(), loadGoogle(), loadHabits(7)]);
  const now = new Date();
  const nowTime = formatTime(now);

  let nextLesson = "–";
  if (untis.status === "ok") {
    const lesson = untis.data.days
      .flatMap((d) => d.lessons)
      .find((l) => l.status !== "cancelled" && (l.day > day || (l.day === day && l.end > nowTime)));
    if (lesson) {
      const when = lesson.day === day ? lesson.start : `${new Date(`${lesson.day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" })} ${lesson.start}`;
      nextLesson = `${lesson.subjectLong ?? lesson.subject} · ${when}${lesson.rooms.length ? ` · ${lesson.rooms[0]}` : ""}`;
    } else nextLesson = "Kein Unterricht mehr";
  } else if (untis.status === "unconfigured") nextLesson = "Nicht verbunden";

  let nextEvent = "–";
  let unread = "–";
  if (google.status === "ok") {
    const e = google.data.events.find((ev) => (ev.allDay ? ev.start.slice(0, 10) >= day : new Date(ev.end) > now));
    nextEvent = e ? `${e.title} · ${e.allDay ? new Date(`${e.start.slice(0, 10)}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }) : formatTime(e.start)}` : "Keine Termine";
    unread = `${google.data.mail.unread} ungelesen`;
  } else if (google.status === "unconfigured") {
    nextEvent = unread = "Nicht verbunden";
  }

  const open = habits.filter((h) => !h.doneToday).length;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{formatDayLong(day)}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(now)} 👋</h1>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Chip icon={<GraduationCap className="size-4" />} label="Nächste Stunde" value={nextLesson} />
        <Chip icon={<CalendarClock className="size-4" />} label="Nächster Termin" value={nextEvent} />
        <Chip
          icon={<ListChecks className="size-4" />}
          label="Gewohnheiten"
          value={habits.length ? (open ? `${open} von ${habits.length} offen` : "Alles erledigt ✓") : "Noch keine"}
        />
        <Chip icon={<Mail className="size-4" />} label="Posteingang" value={unread} />
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-xl bg-card ring-1 ring-foreground/8" />
        ))}
      </div>
    </section>
  );
}
