import { Newspaper } from "lucide-react";
import { loadNews } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { RefreshButton } from "../refresh-button";
import { ResultView, WidgetCard } from "../widget-card";

export async function NewsWidget({ className }: { className?: string }) {
  const result = await loadNews();
  return (
    <WidgetCard title="Nachrichten" icon={Newspaper} className={className} action={<RefreshButton integration="news" />}>
      <ResultView result={result} integration="news">
        {(items) => (
          <ul className="divide-y text-sm">
            {items.slice(0, 7).map((n) => (
              <li key={n.link + n.title} className="py-2 first:pt-0 last:pb-0">
                <a href={n.link} target="_blank" rel="noreferrer" className="group block">
                  <p className="leading-snug font-medium group-hover:underline">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.source}
                    {n.published ? ` · ${relativeTime(n.published)}` : ""}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </ResultView>
    </WidgetCard>
  );
}
