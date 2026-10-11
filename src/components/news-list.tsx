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
            <a href={n.link} target="_blank" rel="noreferrer" className="group flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-medium group-hover:underline">{n.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {n.local ? (
                    <span className="inline-flex items-center gap-0.5 font-medium text-series-2">
                      <MapPin className="size-3" aria-hidden /> In deiner Nähe ·
                    </span>
                  ) : null}
                  {n.source}
                  {n.published ? ` · ${relativeTime(n.published)}` : ""}
                </p>
              </div>
              <Thumb src={n.image} source={n.source} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thumb({ src, source }: { src?: string; source: string }) {
  const [failed, setFailed] = useState(false);
  const box = "h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted sm:h-16 sm:w-24";
  if (!src || failed) {
    return (
      <div className={cn(box, "grid place-items-center text-lg font-semibold text-muted-foreground/60")} aria-hidden>
        {source.charAt(0)}
      </div>
    );
  }
  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- externe Feed-Bilder, kein Bild-Proxy nötig */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </div>
  );
}
