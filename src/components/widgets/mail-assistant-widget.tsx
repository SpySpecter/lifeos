import Link from "next/link";
import { loadMailAssistant } from "@/integrations/loaders";
import { relativeTime } from "@/lib/time";
import { MailAssistant, RunTriageButton } from "../mail-assistant";
import { WidgetCard } from "../widget-card";

export async function MailAssistantWidget({ className }: { className?: string }) {
  const data = await loadMailAssistant();
  return (
    <WidgetCard title="Mail-Assistent" className={className} action={data ? <RunTriageButton /> : null}>
      {!data ? (
        <p className="py-2 text-subhead text-muted-foreground">
          Verbinde ein Google-Konto, damit der Assistent deinen Posteingang sortieren kann.{" "}
          <Link href="/settings#google" className="font-semibold text-tint-text">
            Einrichten
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {data.needsReconnect.length ? (
            <p className="rounded-[12px] bg-warning/15 px-3 py-2 text-footnote">
              Für die Sortierung braucht LifeOS Schreibrechte bei Gmail:{" "}
              <Link href="/settings#google" className="font-medium underline underline-offset-4">
                {data.needsReconnect.join(", ")} neu verbinden
              </Link>
            </p>
          ) : null}
          {!data.aiConfigured ? (
            <p className="rounded-[12px] bg-warning/15 px-3 py-2 text-footnote">
              <code>OPENAI_API_KEY</code> fehlt – bis dahin greifen nur deine Regeln.
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Gelöscht", data.today.trashed],
                ["Archiviert", data.today.archived],
                ["Behalten", data.today.kept],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="flex flex-col-reverse rounded-[14px] bg-muted py-2.5">
                <dt className="text-footnote text-muted-foreground">{label}</dt>
                <dd className="font-heading text-title2 leading-tight font-bold tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          <MailAssistant pending={data.pending} recent={data.recent} multi={new Set(data.pending.map((p) => p.account)).size > 1} />
          <p className="text-footnote text-muted-foreground">
            {data.lastRun ? `Zuletzt sortiert ${relativeTime(data.lastRun.at)}` : "Noch nicht gelaufen"} · läuft täglich 06:00 &amp; 16:00 · KI
            diesen Monat {data.monthUsd.toLocaleString("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 })} von{" "}
            {data.budgetUsd} $
            {data.lastRun?.error ? <span className="text-critical"> · Fehler: {data.lastRun.error}</span> : null}
          </p>
        </div>
      )}
    </WidgetCard>
  );
}
