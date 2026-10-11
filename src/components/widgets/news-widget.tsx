import { Newspaper } from "lucide-react";
import { loadNews } from "@/integrations/loaders";
import { NewsList } from "../news-list";
import { RefreshButton } from "../refresh-button";
import { ResultView, WidgetCard } from "../widget-card";

export async function NewsWidget({ className }: { className?: string }) {
  const result = await loadNews();
  return (
    <WidgetCard title="Nachrichten" icon={Newspaper} className={className} action={<RefreshButton integration="news" />}>
      <ResultView result={result} integration="news">
        {(items) => <NewsList items={items} />}
      </ResultView>
    </WidgetCard>
  );
}
