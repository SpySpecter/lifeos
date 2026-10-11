import { FileSpreadsheet, FileText, Mail, Presentation, File } from "lucide-react";
import { loadGoogle } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { ResultView, WidgetCard } from "../widget-card";

function fileIcon(mime: string) {
  if (mime.includes("spreadsheet")) return FileSpreadsheet;
  if (mime.includes("presentation")) return Presentation;
  if (mime.includes("document") || mime.includes("pdf") || mime.startsWith("text/")) return FileText;
  return File;
}

const link = (url: string) => (url && url !== "#" ? { href: url, target: "_blank", rel: "noreferrer" } : {});

export async function InboxWidget({ className }: { className?: string }) {
  const result = await loadGoogle();
  return (
    <WidgetCard title="Mail & Drive" icon={Mail} className={className}>
      <ResultView result={result} integration="google">
        {({ mail, drive }) => (
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{mail.unread}</span>
              <span className="text-sm text-muted-foreground">ungelesen im Posteingang</span>
            </div>
            <ul className="space-y-2.5 text-sm">
              {mail.latest.slice(0, 3).map((m) => (
                <li key={m.id} className="min-w-0">
                  <a {...link(m.url)} className="group block">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate font-medium group-hover:underline">{m.from}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeTime(m.date)}</span>
                    </p>
                    <p className="truncate text-muted-foreground">{m.subject}</p>
                  </a>
                </li>
              ))}
            </ul>
            {drive.length ? (
              <div className="border-t pt-3">
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Zuletzt bearbeitet</h3>
                <ul className="space-y-1.5 text-sm">
                  {drive.slice(0, 3).map((f) => {
                    const Icon = fileIcon(f.mimeType);
                    return (
                      <li key={f.id}>
                        <a {...link(f.url)} className="flex items-center gap-2 hover:underline">
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{f.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeTime(f.modified)}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </ResultView>
    </WidgetCard>
  );
}
