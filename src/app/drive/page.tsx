import type { Metadata } from "next";
import { FolderLock, Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DriveProtectedForm, DriveQuestions, DriveStart, DriveTrash } from "@/components/drive";
import { PageHeader } from "@/components/page-header";
import { WidgetSkeleton } from "@/components/widget-card";
import { googleAccounts } from "@/integrations/google";
import { db } from "@/lib/db";
import { driveCleanupData, type DriveSummary } from "@/lib/drive/cleanup";
import { isDemo } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { relativeTime } from "@/lib/time";

export const metadata: Metadata = { title: "Drive aufräumen" };

function Section({ id, title, icon, children }: { id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 flex min-h-11 items-center gap-1.5 px-1 text-title3 font-bold tracking-tight">
        {icon}
        {title}
      </h2>
      <div className="overflow-hidden rounded-[20px] bg-card">{children}</div>
    </section>
  );
}

function summaryText(s: DriveSummary): string {
  const parts = [`${s.scanned} Dateien geprüft`, `${s.trashed} in den Papierkorb`, `${s.unklar} Fragen`, `${s.relevant} behalten`];
  if (s.skipped) parts.push(`${s.skipped} schon bekannt`);
  return parts.join(" · ");
}

async function DriveContent() {
  await connection();
  const accounts = isDemo() ? [] : await googleAccounts().catch(() => []);
  const data = await driveCleanupData(db(), accounts);
  const { driveProtected } = getSettings(db());
  const p = data.running?.progress;

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[20px] bg-card p-4">
        <p className="text-subhead text-muted-foreground">
          Unnötiges (Duplikate, leere und nie bearbeitete Dateien, offensichtlicher Datenmüll) kommt in den Drive-Papierkorb. Bei
          Unklarem wirst du hier gefragt, Wichtiges bleibt einfach liegen.
        </p>
        <DriveStart running={Boolean(data.running)} />
        {data.running ? (
          <p role="status" className="text-subhead">
            {p ? `${p.account}: ${p.step}${p.total ? ` (${p.done}/${p.total})` : ""}` : "Wird gestartet …"}
          </p>
        ) : data.lastRun ? (
          <div className="space-y-1 text-subhead">
            <p>
              <span className="text-muted-foreground">Letzter Lauf {relativeTime(data.lastRun.at)}:</span>{" "}
              {data.lastRun.summary ? summaryText(data.lastRun.summary) : null}
            </p>
            {data.lastRun.error ? <p className="text-critical">Abgebrochen: {data.lastRun.error}</p> : null}
            {data.lastRun.summary?.notes.slice(0, 3).map((n) => (
              <p key={n} className="text-footnote text-muted-foreground">
                {n}
              </p>
            ))}
          </div>
        ) : null}
        {data.needsReconnect.length ? (
          <p className="text-subhead text-critical">
            Drive-Rechte fehlen für {data.needsReconnect.join(", ")} –{" "}
            <Link href="/settings#google" className="font-medium text-tint-text">
              neu verbinden
            </Link>
          </p>
        ) : null}
        {!data.aiConfigured && !isDemo() ? (
          <p className="text-footnote text-muted-foreground">Ohne OpenAI-Schlüssel greifen nur die festen Regeln.</p>
        ) : null}
      </div>

      <Section id="fragen" title={data.counts.offen ? `Fragen (${data.counts.offen})` : "Fragen"}>
        <DriveQuestions rows={data.pending} />
      </Section>

      <Section id="papierkorb" title="Im Papierkorb" icon={<Trash2 className="size-5 text-muted-foreground" aria-hidden />}>
        <DriveTrash rows={data.trashed} />
      </Section>

      <Section id="geschuetzt" title="Geschützte Ordner" icon={<FolderLock className="size-5 text-muted-foreground" aria-hidden />}>
        <DriveProtectedForm folders={driveProtected} />
      </Section>

      <p className="flex gap-2 px-1 text-footnote text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        LifeOS löscht nie endgültig. Dateien im Drive-Papierkorb lassen sich 30 Tage lang wiederherstellen – hier oder in Google
        Drive. Markierte, geteilte und in den letzten 90 Tagen benutzte Dateien werden nie angefasst.
      </p>
    </div>
  );
}

export default function DrivePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Drive aufräumen" back={{ href: "/settings", label: "Einstellungen" }} />
      <Suspense fallback={<WidgetSkeleton lines={6} />}>
        <DriveContent />
      </Suspense>
    </div>
  );
}
