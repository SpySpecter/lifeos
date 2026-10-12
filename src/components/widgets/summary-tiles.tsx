import {
  CalendarDays,
  CloudSun,
  GitBranch,
  GraduationCap,
  Heart,
  Inbox,
  ListChecks,
  MailCheck,
  Music,
  Newspaper,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import {
  currentDay,
  loadExams,
  loadGitHub,
  loadGoogle,
  loadHabits,
  loadHealth,
  loadMailAssistant,
  loadNews,
  loadSettings,
  loadSpotify,
  loadUntis,
  loadWeather,
} from "@/integrations/loaders";
import type { WidgetResult } from "@/integrations/core";
import type { WidgetId } from "@/lib/dashboard";
import { examTile, lessonTile, weatherTile, type Tone } from "@/lib/hero";
import { dayString, formatTime } from "@/lib/time";

/** Inhalt einer kompakten Kachel: Symbol + Titel, eine Kennzahl oder kurze Überschrift, eine Zeile Zusammenhang. */
export type Summary = {
  icon: LucideIcon;
  color: string;
  title: string;
  value?: string;
  unit?: string;
  /** statt einer Zahl ein kurzer Text (z. B. Songtitel) */
  headline?: string;
  caption: string;
  tone?: Tone;
  /** Hinweis in der Unterzeile (z. B. „CI rot“), unabhängig von der Kennzahl */
  captionTone?: Tone;
};

const n = (v: number) => v.toLocaleString("de-DE");

function fromResult<T>(base: Omit<Summary, "caption">, result: WidgetResult<T>, ok: (d: T) => Partial<Summary> & { caption: string }): Summary {
  if (result.status === "unconfigured") return { ...base, caption: "Nicht verbunden" };
  if (result.status === "error") return { ...base, caption: "Gerade nicht erreichbar" };
  return { ...base, ...ok(result.data) };
}

const SUMMARIES: Record<WidgetId, () => Promise<Summary>> = {
  async school() {
    const [r, day] = await Promise.all([loadUntis(), currentDay()]);
    return fromResult({ icon: GraduationCap, color: "var(--cat-school)", title: "Schule" }, r, (week) => {
      const t = lessonTile(week, day, formatTime(new Date()));
      return { value: t.value, caption: `${t.label} · ${t.caption}`, tone: t.tone };
    });
  },
  async exams() {
    const [r, day] = await Promise.all([loadExams(), currentDay()]);
    return fromResult({ icon: NotebookPen, color: "var(--cat-exams)", title: "Klausuren" }, r, (list) => {
      const t = examTile(list, day);
      return { value: t.value, unit: t.unit, caption: t.caption, tone: t.tone };
    });
  },
  async habits() {
    const habits = await loadHabits(1);
    const done = habits.filter((h) => h.doneToday).length;
    return {
      icon: ListChecks,
      color: "var(--cat-habits)",
      title: "Gewohnheiten",
      value: habits.length ? String(done) : "–",
      unit: habits.length ? `von ${habits.length}` : undefined,
      caption: !habits.length ? "Noch keine angelegt" : done === habits.length ? "Alles erledigt 🎉" : "heute erledigt",
    };
  },
  async weather() {
    const { result } = await loadWeather();
    return fromResult({ icon: CloudSun, color: "var(--cat-weather)", title: "Wetter" }, result, (w) => {
      const t = weatherTile(w);
      return { value: t.value, caption: t.caption };
    });
  },
  async calendar() {
    const [r, day] = await Promise.all([loadGoogle(), currentDay()]);
    return fromResult({ icon: CalendarDays, color: "var(--cat-calendar)", title: "Termine" }, r, ({ events }) => {
      const todays = events.filter((e) => (e.allDay ? e.start.slice(0, 10) : dayString(new Date(e.start))) <= day);
      const next = events.find((e) => e.allDay || new Date(e.end) > new Date());
      return {
        value: String(todays.length),
        unit: "heute",
        caption: next ? `${next.allDay ? "Ganztägig" : formatTime(next.start)} ${next.title}` : "Nichts geplant",
      };
    });
  },
  async mail() {
    const data = await loadMailAssistant();
    const base = { icon: MailCheck, color: "var(--cat-mail)", title: "Mail-Assistent" };
    if (!data) return { ...base, caption: "Nicht verbunden" };
    const p = data.pending.length;
    return {
      ...base,
      value: String(p),
      unit: p === 1 ? "Frage" : "Fragen",
      caption: p ? "warten auf deine Entscheidung" : `Alles sortiert · ${n(data.today.trashed + data.today.archived)} weg heute`,
      tone: p ? "warning" : "normal",
    };
  },
  async inbox() {
    const r = await loadGoogle();
    return fromResult({ icon: Inbox, color: "var(--cat-inbox)", title: "Posteingang" }, r, ({ mail }) => {
      const unread = mail.reduce((s, a) => s + a.unread, 0);
      const latest = mail.flatMap((a) => a.latest).sort((a, b) => b.date.localeCompare(a.date))[0];
      return { value: n(unread), unit: "ungelesen", caption: latest ? `${latest.from}: ${latest.subject}` : "Nichts Neues ✨" };
    });
  },
  async health() {
    const [{ series }, { goals }] = await Promise.all([loadHealth(1), loadSettings()]);
    const steps = series.steps[0];
    return {
      icon: Heart,
      color: "var(--cat-health)",
      title: "Gesundheit",
      value: steps === null ? "–" : n(steps),
      unit: "Schritte",
      caption: `Ziel ${n(goals.steps)}${series.sleep[0] !== null ? ` · ${String(series.sleep[0]).replace(".", ",")} h Schlaf` : ""}`,
    };
  },
  async news() {
    const r = await loadNews();
    return fromResult({ icon: Newspaper, color: "var(--cat-news)", title: "Nachrichten" }, r, (items) => {
      const local = items.find((i) => i.local);
      const top = local ?? items[0];
      return { headline: top?.title ?? "Keine Meldungen", caption: top ? `${local ? "📍 In deiner Nähe · " : ""}${top.source}` : "" };
    });
  },
  async music() {
    const r = await loadSpotify();
    return fromResult({ icon: Music, color: "var(--cat-music)", title: "Musik" }, r, (s) => {
      const t = s.nowPlaying ?? s.recent[0];
      if (!t) return { headline: "Nichts gehört", caption: "Spotify ist bereit" };
      return { headline: t.name, caption: `${t.artists} · ${s.nowPlaying?.isPlaying ? "läuft gerade" : "zuletzt gehört"}` };
    });
  },
  async github() {
    const r = await loadGitHub();
    return fromResult({ icon: GitBranch, color: "var(--cat-github)", title: "GitHub" }, r, (g) => {
      const red = g.repos.filter((x) => x.lastCommit?.ci === "FAILURE" || x.lastCommit?.ci === "ERROR").length;
      return {
        value: n(g.totalContributions),
        unit: "Beiträge",
        caption: red ? `CI rot in ${red} ${red === 1 ? "Repo" : "Repos"}` : `${g.pullRequests.length} offene PRs · CI ok`,
        captionTone: red ? "critical" : "normal",
      };
    });
  },
};

export async function loadSummary(id: WidgetId): Promise<Summary> {
  return SUMMARIES[id]();
}
