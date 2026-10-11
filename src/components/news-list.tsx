"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import type { NewsItem } from "@/integrations/news";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const ORDER = ["Alle", "Region", "Politik", "Blaulicht", "Tech", "Allgemein"];

export function NewsList({ items, limit = 8 }: { items: NewsItem[]; limit?: number }) {
  const categories = ORDER.filter((c) => c === "Alle" || items.some((i) => i.category === c));
  const [tab, setTab] = useState("Alle");
  const shown = (tab === "Alle" ? items : items.filter((i) => i.category === tab)).slice(0, limit);

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Kategorie">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={tab === c}
            onClick={() => setTab(c)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted",
              tab === c && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="divide-y text-sm">
        {shown.map((n) => (
          <li key={n.link + n.title} className="py-2 first:pt-0 last:pb-0">
            <a href={n.link} target="_blank" rel="noreferrer" className="group block">
              <p className="leading-snug font-medium group-hover:underline">{n.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {n.local ? (
                  <span className="inline-flex items-center gap-0.5 font-medium text-series-2">
                    <MapPin className="size-3" aria-hidden /> In deiner Nähe ·
                  </span>
                ) : null}
                {n.source}
                {n.published ? ` · ${relativeTime(n.published)}` : ""}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
