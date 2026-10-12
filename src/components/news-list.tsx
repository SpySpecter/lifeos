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
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Kategorie">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={tab === c}
            onClick={() => setTab(c)}
            className={cn(
              "min-h-9 shrink-0 rounded-full bg-muted px-3.5 text-subhead font-medium active:opacity-70",
              tab === c && "bg-foreground text-background",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="ios-rows">
        {shown.map((n) => (
          <li key={n.link + n.title} className="py-3 last:pb-0">
            <a href={n.link} target="_blank" rel="noreferrer" className="group flex items-start gap-3 active:opacity-70">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-body leading-snug font-semibold">{n.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-footnote text-muted-foreground">
                  {n.local ? (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-serious">
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
  const box = "h-16 w-[5.5rem] shrink-0 overflow-hidden rounded-[10px] bg-muted sm:w-24";
  if (!src || failed) {
    return (
      <div className={cn(box, "grid place-items-center text-title3 font-semibold text-muted-foreground")} aria-hidden>
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
