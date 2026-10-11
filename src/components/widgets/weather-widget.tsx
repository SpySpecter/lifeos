import { CloudSun, Droplets, Sunrise, Sunset, Wind } from "lucide-react";
import { loadWeather } from "@/integrations/loaders";
import { describeWeather } from "@/lib/weather-codes";
import { weekdayShort } from "@/lib/time";
import { LocateButton } from "../locate-button";
import { ResultView, WidgetCard } from "../widget-card";
import { WeatherIcon } from "../weather-icon";

const deg = (n: number) => `${Math.round(n)}°`;

export async function WeatherWidget({ className }: { className?: string }) {
  const { located, result } = await loadWeather();
  return (
    <WidgetCard
      title={result.status === "ok" && result.data.place ? `Wetter · ${result.data.place}` : "Wetter"}
      icon={CloudSun}
      className={className}
      action={<LocateButton located={located} />}
    >
      <ResultView result={result} integration="weather">
        {(w) => {
          const now = describeWeather(w.current.code, w.current.isDay);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <WeatherIcon icon={now.icon} className="size-12 text-series-1" />
                <div>
                  <p className="text-4xl font-semibold tracking-tight tabular-nums">{deg(w.current.temp)}</p>
                  <p className="text-sm text-muted-foreground">
                    {now.label} · gefühlt {deg(w.current.feelsLike)}
                  </p>
                </div>
                <dl className="ml-auto shrink-0 space-y-1 text-right text-xs whitespace-nowrap text-muted-foreground">
                  <div className="flex items-center justify-end gap-1">
                    <Wind className="size-3.5" aria-hidden />
                    <dt className="sr-only">Wind</dt>
                    <dd>{Math.round(w.current.wind)} km/h</dd>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Sunrise className="size-3.5" aria-hidden />
                    <dt className="sr-only">Sonnenaufgang</dt>
                    <dd>{w.sunrise.slice(11, 16)}</dd>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Sunset className="size-3.5" aria-hidden />
                    <dt className="sr-only">Sonnenuntergang</dt>
                    <dd>{w.sunset.slice(11, 16)}</dd>
                  </div>
                </dl>
              </div>

              <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto" aria-label="Nächste Stunden">
                {w.hourly.map((h) => (
                  <li key={h.time} className="flex min-w-11 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs">
                    <span className="text-muted-foreground">{h.time.slice(11, 13)}</span>
                    <WeatherIcon icon={describeWeather(h.code).icon} className="size-4" />
                    <span className="font-medium tabular-nums">{deg(h.temp)}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {h.precipProb >= 20 ? (
                        <>
                          <Droplets className="size-2.5" aria-hidden />
                          {h.precipProb}%
                        </>
                      ) : (
                        " "
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              <ul className="grid grid-cols-5 gap-1 border-t pt-3 text-center text-xs">
                {w.daily.map((d, i) => (
                  <li key={d.day} className="flex flex-col items-center gap-1">
                    <span className="text-muted-foreground">{i === 0 ? "Heute" : weekdayShort(d.day)}</span>
                    <WeatherIcon icon={describeWeather(d.code).icon} className="size-4" />
                    <span className="tabular-nums">
                      <span className="font-medium">{deg(d.max)}</span>{" "}
                      <span className="text-muted-foreground">{deg(d.min)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
