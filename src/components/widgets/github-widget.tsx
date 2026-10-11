import { GitPullRequest, GitCommitHorizontal, Lock } from "lucide-react";
import { loadGitHub } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { CiStatus } from "../ci-status";
import { Heatmap } from "../heatmap";
import { ResultView, WidgetCard } from "../widget-card";

const link = (url: string) => (url && url !== "#" ? { href: url, target: "_blank", rel: "noreferrer" } : {});

export async function GitHubWidget({ className }: { className?: string }) {
  const result = await loadGitHub();
  return (
    <WidgetCard title="GitHub" icon={GitCommitHorizontal} className={className}>
      <ResultView result={result} integration="github">
        {(gh) => (
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{gh.totalContributions.toLocaleString("de-DE")}</span>
              <span className="text-sm text-muted-foreground">Beiträge im letzten Jahr · @{gh.login}</span>
            </div>
            <Heatmap
              cells={gh.days.map((d) => ({ day: d.date, value: d.count }))}
              label="Beiträge der letzten 15 Wochen"
              unit={(v) => `${v} Beiträge`}
            />
            <ul className="divide-y text-sm">
              {gh.repos.slice(0, 4).map((r) => (
                <li key={r.name} className="flex items-center gap-3 py-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: r.language?.color ?? "var(--muted-foreground)" }}
                    title={r.language?.name}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 font-medium">
                      <a {...link(r.url)} className="truncate hover:underline">
                        {r.name}
                      </a>
                      {r.isPrivate ? <Lock className="size-3 text-muted-foreground" aria-label="privat" /> : null}
                    </p>
                    {r.lastCommit ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {r.lastCommit.message} · {relativeTime(r.lastCommit.date)}
                      </p>
                    ) : null}
                  </div>
                  <CiStatus state={r.lastCommit?.ci ?? null} />
                </li>
              ))}
            </ul>
            {gh.pullRequests.length ? (
              <div className="border-t pt-3">
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Offene Pull Requests</h3>
                <ul className="space-y-1.5 text-sm">
                  {gh.pullRequests.map((p) => (
                    <li key={p.url + p.title} className="flex items-center gap-2">
                      <GitPullRequest className="size-4 shrink-0 text-good" aria-hidden />
                      <a {...link(p.url)} className="min-w-0 flex-1 truncate hover:underline">
                        {p.title}
                      </a>
                      <CiStatus state={p.ci} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </ResultView>
    </WidgetCard>
  );
}
