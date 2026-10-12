import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsLink } from "@/components/nav";
import { PageHeader } from "@/components/page-header";
import { WidgetSkeleton } from "@/components/widget-card";
import { ExamsWidget } from "@/components/widgets/exams-widget";
import { SchoolChanges } from "@/components/widgets/school-changes";
import { SchoolWidget } from "@/components/widgets/school-widget";

export const metadata: Metadata = { title: "Schule" };

export default function SchoolPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Schule" trailing={<SettingsLink className="sm:hidden" />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <Suspense fallback={<WidgetSkeleton lines={10} />}>
          <SchoolWidget days={7} title="Stundenplan" href={null} />
        </Suspense>
        <div className="space-y-6">
          <div id="aenderungen" className="scroll-mt-16 sm:scroll-mt-20">
            <Suspense fallback={<WidgetSkeleton lines={3} />}>
              <SchoolChanges />
            </Suspense>
          </div>
          <div id="klausuren" className="scroll-mt-16 sm:scroll-mt-20">
            <Suspense fallback={<WidgetSkeleton lines={5} />}>
              <ExamsWidget limit={30} href={null} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
