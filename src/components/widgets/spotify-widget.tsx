import { Music, Pause, Play } from "lucide-react";
import { loadSpotify } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { ResultView, WidgetCard } from "../widget-card";

const link = (url: string) => (url && url !== "#" ? { href: url, target: "_blank", rel: "noreferrer" } : {});
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function Cover({ src, alt, size = "size-12" }: { src: string | null; alt: string; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- externe Spotify-CDN-Bilder, keine Optimierung nötig
  return src ? <img src={src} alt={alt} className={`${size} shrink-0 rounded-md object-cover`} /> : (
    <div className={`${size} grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-series-3/70 to-series-1/70 text-white`} aria-hidden>
      <Music className="size-1/2" />
    </div>
  );
}

export async function SpotifyWidget({ className }: { className?: string }) {
  const result = await loadSpotify();
  return (
    <WidgetCard title="Musik" className={className}>
      <ResultView result={result} integration="spotify">
        {(s) => (
          <div className="space-y-4">
            {s.nowPlaying ? (
              <a {...link(s.nowPlaying.url)} className="flex items-center gap-3 rounded-[14px] bg-muted p-3">
                <Cover src={s.nowPlaying.image} alt={s.nowPlaying.album} size="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-footnote text-muted-foreground">
                    {s.nowPlaying.isPlaying ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
                    {s.nowPlaying.isPlaying ? "Läuft gerade" : "Pausiert"}
                  </p>
                  <p className="truncate font-semibold">{s.nowPlaying.name}</p>
                  <p className="truncate text-subhead text-muted-foreground">{s.nowPlaying.artists}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-caption2 text-muted-foreground tabular-nums">
                    <span>{mmss(s.nowPlaying.progressMs)}</span>
                    <div className="h-1 flex-1 rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full bg-series-3"
                        style={{ width: `${(s.nowPlaying.progressMs / s.nowPlaying.durationMs) * 100}%` }}
                      />
                    </div>
                    <span>{mmss(s.nowPlaying.durationMs)}</span>
                  </div>
                </div>
              </a>
            ) : (
              <p className="text-subhead text-muted-foreground">Gerade läuft nichts.</p>
            )}
            <ul className="space-y-2 text-subhead">
              {s.recent.slice(0, 4).map((t) => (
                <li key={t.playedAt}>
                  <a {...link(t.url)} className="flex items-center gap-3 active:opacity-70">
                    <Cover src={t.image} alt={t.album} size="size-8" />
                    <span className="min-w-0 flex-1 truncate">
                      {t.name} <span className="text-muted-foreground">· {t.artists}</span>
                    </span>
                    <span className="shrink-0 text-footnote text-muted-foreground">{relativeTime(t.playedAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
            {s.topArtists.length ? (
              <div className="border-t border-border pt-3">
                <h3 className="mb-1.5 text-footnote font-semibold text-muted-foreground">Top-Artists (4 Wochen)</h3>
                <ol className="flex flex-wrap gap-1.5 text-footnote">
                  {s.topArtists.map((a, i) => (
                    <li key={a.name}>
                      <a {...link(a.url)} className="inline-flex rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70">
                        <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                        {a.name}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        )}
      </ResultView>
    </WidgetCard>
  );
}
