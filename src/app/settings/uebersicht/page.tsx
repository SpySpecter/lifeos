import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardEditor } from "@/components/dashboard-editor";
import { PageHeader } from "@/components/page-header";
import { WidgetSkeleton } from "@/components/widget-card";
import { loadSettings } from "@/integrations/loaders";

export const metadata: Metadata = { title: "Übersicht anpassen" };

async function Editor() {
  const { dashboard } = await loadSettings();
  return <DashboardEditor layout={dashboard} />;
}

export default function CustomizePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Übersicht anpassen" back={{ href: "/", label: "Heute" }} />
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <Editor />
      </Suspense>
    </div>
  );
}
