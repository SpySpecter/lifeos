import type { ReactNode } from "react";
import { Suspense } from "react";
import { CalendarWidget } from "@/components/widgets/calendar-widget";
import { ExamsWidget } from "@/components/widgets/exams-widget";
import { GitHubWidget } from "@/components/widgets/github-widget";
import { HabitsWidget } from "@/components/widgets/habits-widget";
import { HealthWidget } from "@/components/widgets/health-widget";
import { InboxWidget } from "@/components/widgets/inbox-widget";
import { MailAssistantWidget } from "@/components/widgets/mail-assistant-widget";
import { NewsWidget } from "@/components/widgets/news-widget";
import { SchoolWidget } from "@/components/widgets/school-widget";
import { SpotifyWidget } from "@/components/widgets/spotify-widget";
import { TodayHero, TodayHeroSkeleton } from "@/components/widgets/today-hero";
import { WeatherWidget } from "@/components/widgets/weather-widget";
import { WidgetSkeleton } from "@/components/widget-card";
import { cn } from "@/lib/utils";

/**
 * Reihenfolge im DOM = Reihenfolge auf dem Handy (das Wichtigste für unterwegs zuerst).
 * Ab xl ordnet `order` die Kacheln für drei Spalten neu.
 */
function Slot({ id, desktop, lines = 5, className, children }: { id?: string; desktop: string; lines?: number; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={cn("scroll-mt-20", desktop, className)}>
      <Suspense fallback={<WidgetSkeleton lines={lines} />}>{children}</Suspense>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <Suspense fallback={<TodayHeroSkeleton />}>
        <TodayHero />
      </Suspense>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Slot id="schule" desktop="xl:order-1" lines={6}>
          <SchoolWidget />
        </Slot>
        <Slot id="klausuren" desktop="xl:order-2" lines={4}>
          <ExamsWidget />
        </Slot>
        <Slot desktop="xl:order-6">
          <HabitsWidget />
        </Slot>
        <Slot id="wetter" desktop="xl:order-3">
          <WeatherWidget />
        </Slot>
        <Slot desktop="xl:order-4">
          <CalendarWidget />
        </Slot>
        <Slot desktop="xl:order-5" lines={6}>
          <MailAssistantWidget />
        </Slot>
        <Slot desktop="xl:order-7">
          <InboxWidget />
        </Slot>
        <Slot desktop="xl:order-8">
          <HealthWidget />
        </Slot>
        <Slot desktop="xl:order-9" lines={6}>
          <NewsWidget />
        </Slot>
        <Slot desktop="xl:order-10">
          <SpotifyWidget />
        </Slot>
        <Slot desktop="xl:order-11" className="md:col-span-2 xl:col-span-1">
          <GitHubWidget />
        </Slot>
      </div>
    </div>
  );
}
