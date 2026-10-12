import { File, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { loadGoogle } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { RefreshButton } from "../refresh-button";
import { ResultView, WidgetCard } from "../widget-card";

function fileIcon(mime: string) {
  if (mime.includes("spreadsheet")) return FileSpreadsheet;
  if (mime.includes("presentation")) return Presentation;
  if (mime.includes("document") || mime.includes("pdf") || mime.startsWith("text/")) return FileText;
  return File;
}

const link = (url: string) => (url && url !== "#" ? { href: url, target: "_blank", rel: "noreferrer" } : {});
/** Kurzname eines Kontos; teilen sich mehrere Konten den Namen vor dem @, wird die Domain genommen. */
function accountLabel(email: string, all: string[]): string {
  const local = email.split("@")[0];
  return all.filter((a) => a.split("@")[0] === local).length > 1 ? (email.split("@")[1] ?? email).split(".")[0] : local;
}

export async function InboxWidget({ className }: { className?: string }) {
  const result = await loadGoogle();
  return (
    <WidgetCard title="Posteingang" className={className} action={<RefreshButton integration="google" />}>
      <ResultView result={result} integration="google">
        {({ mail, drive, errors }) => {
          const multi = mail.length > 1;
          const all = mail.map((a) => a.account);
          const short = (email: string) => accountLabel(email, all);
          const unread = mail.reduce((n, a) => n + a.unread, 0);
          const latest = mail
            .flatMap((a) => a.latest)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 5);
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-heading text-title1 font-bold tabular-nums">{unread}</span>
                <span className="text-subhead text-muted-foreground">ungelesen</span>
                {multi ? (
                  <span className="flex flex-wrap gap-1 sm:ml-auto">
                    {mail.map((a) => (
                      <span key={a.account} className="rounded-full bg-muted px-2 py-0.5 text-footnote text-muted-foreground" title={a.account}>
                        {short(a.account)} <span className="font-medium text-foreground tabular-nums">{a.unread}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
              {latest.length ? (
                <ul className="space-y-2.5 text-subhead">
                  {latest.map((m) => (
                    <li key={m.account + m.id} className="min-w-0">
                      <a {...link(m.url)} className="group block">
                        <p className="flex items-baseline gap-2">
                          <span className="truncate font-semibold group-active:opacity-70">{m.from}</span>
                          <span className="ml-auto shrink-0 text-footnote text-muted-foreground">{relativeTime(m.date)}</span>
                        </p>
                        <p className="truncate text-muted-foreground">
                          {multi ? <span className="text-footnote">{short(m.account)} · </span> : null}
                          {m.subject}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-subhead text-muted-foreground">Keine ungelesenen Mails. ✨</p>
              )}
              {errors.length ? (
                <p className="text-footnote text-critical">
                  {errors.map((e) => `${e.account}: ${e.message}`).join(" · ")}
                </p>
              ) : null}
              {drive.length ? (
                <div className="border-t border-border pt-3">
                  <h3 className="mb-1.5 text-footnote font-semibold text-muted-foreground">Drive · zuletzt bearbeitet</h3>
                  <ul className="space-y-1.5 text-subhead">
                    {drive.slice(0, 3).map((f) => {
                      const Icon = fileIcon(f.mimeType);
                      return (
                        <li key={f.account + f.id}>
                          <a {...link(f.url)} className="flex items-center gap-2 active:opacity-70">
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">{f.name}</span>
                            <span className="ml-auto shrink-0 text-footnote text-muted-foreground">{relativeTime(f.modified)}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        }}
      </ResultView>
    </WidgetCard>
  );
}
