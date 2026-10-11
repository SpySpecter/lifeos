import { Suspense } from "react";
import { CalendarWidget } from "@/components/widgets/calendar-widget";
import { GitHubWidget } from "@/components/widgets/github-widget";
import { HabitsWidget } from "@/components/widgets/habits-widget";
import { HealthWidget } from "@/components/widgets/health-widget";
import { InboxWidget } from "@/components/widgets/inbox-widget";
import { NewsWidget } from "@/components/widgets/news-widget";
import { SchoolWidget } from "@/components/widgets/school-widget";
import { SpotifyWidget } from "@/components/widgets/spotify-widget";
import { TodayHero, TodayHeroSkeleton } from "@/components/widgets/today-hero";
import { WeatherWidget } from "@/components/widgets/weather-widget";
import { WidgetSkeleton } from "@/components/widget-card";

// Jedes Widget lädt unabhängig und streamt nach, sobald seine Quelle antwortet.
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TodayHeroSkeleton />}>
        <TodayHero />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<WidgetSkeleton lines={6} />}>
          <SchoolWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={6} />}>
          <CalendarWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={5} />}>
          <WeatherWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={5} />}>
          <HabitsWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={5} />}>
          <HealthWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={5} />}>
          <InboxWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={6} />}>
          <GitHubWidget className="md:col-span-2 xl:col-span-1" />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={5} />}>
          <SpotifyWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton lines={6} />}>
          <NewsWidget />
        </Suspense>
      </div>
    </div>
  );
}
