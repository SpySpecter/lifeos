"use client";

import { Archive, Check, ExternalLink, FileText, Image as ImageIcon, RotateCcw, Sheet as SheetIcon, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useOptimistic, useTransition } from "react";
import { decideDriveAction, type FormState, saveDriveProtectedAction, startDriveCleanupAction, undoDriveAction } from "@/app/actions";
import type { DriveRow } from "@/lib/drive/cleanup";
import { formatSize } from "@/lib/drive/policy";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { SwipeRow } from "./ios/swipe-row";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={cn("text-subhead", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  );
}

/** Startknopf; solange ein Lauf aktiv ist, lädt die Seite alle 3 Sekunden den Fortschritt nach. */
export function DriveStart({ running }: { running: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startDriveCleanupAction, null);
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending || running}
        className="flex min-h-12 w-full items-center justify-center rounded-[14px] bg-tint px-4 text-body font-semibold text-white active:opacity-80 disabled:opacity-50"
      >
        {running ? "Läuft …" : pending ? "Wird gestartet …" : "Aufräumen starten"}
      </button>
      <Status state={state} />
    </form>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const Icon = mime.startsWith("image/")
    ? ImageIcon
    : mime.startsWith("video/")
      ? Video
      : mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")
        ? SheetIcon
        : mime.includes("zip") || mime.includes("compressed")
          ? Archive
          : FileText;
  return <Icon className="size-[1.375rem] shrink-0 text-muted-foreground" aria-hidden />;
}

function subtitle(r: DriveRow): string {
  return [r.path || "Meine Ablage", formatSize(r.size), r.reason].filter(Boolean).join(" · ");
}

function OpenLink({ r }: { r: DriveRow }) {
  if (!r.url) return null;
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`„${r.name}“ in Drive öffnen`}
      className="grid size-11 shrink-0 place-items-center text-tint active:opacity-60"
    >
      <ExternalLink className="size-[1.125rem]" aria-hidden />
    </a>
  );
}

const key = (r: Pick<DriveRow, "account" | "id">) => `${r.account}|${r.id}`;

/** Unklare Dateien: rechts wischen = behalten, links wischen = Papierkorb; beides auch als Knöpfe. */
export function DriveQuestions({ rows }: { rows: DriveRow[] }) {
  const [visible, hide] = useOptimistic(rows, (list, k: string) => list.filter((r) => key(r) !== k));
  const [, start] = useTransition();
  const decide = (r: DriveRow, choice: "behalten" | "papierkorb") =>
    start(async () => {
      haptic();
      hide(key(r));
      await decideDriveAction(r.account, r.id, choice);
    });
  if (!visible.length) {
    return <p className="px-4 py-3 text-subhead text-muted-foreground">Keine offenen Fragen.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {visible.map((r) => (
        <li key={key(r)}>
          <SwipeRow
            leading={{ label: "Behalten", icon: Check, tone: "bg-good", onAction: () => decide(r, "behalten") }}
            trailing={[{ label: "Papierkorb", icon: Trash2, tone: "bg-critical", onAction: () => decide(r, "papierkorb") }]}
          >
            <div className="flex items-start gap-3 px-4 py-2.5">
              <div className="pt-0.5">
                <FileIcon mime={r.mime} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{r.name}</p>
                <p className="line-clamp-2 text-footnote text-muted-foreground">{subtitle(r)}</p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r, "behalten")}
                    className="min-h-9 rounded-full bg-muted px-3.5 text-subhead font-medium active:opacity-60"
                  >
                    Behalten
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r, "papierkorb")}
                    className="min-h-9 rounded-full bg-muted px-3.5 text-subhead font-medium text-critical active:opacity-60"
                  >
                    Papierkorb
                  </button>
                </div>
              </div>
              <OpenLink r={r} />
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}

/** Automatisch in den Papierkorb gelegte Dateien – mit „Wiederherstellen“. */
export function DriveTrash({ rows }: { rows: DriveRow[] }) {
  const [visible, hide] = useOptimistic(rows, (list, k: string) => list.filter((r) => key(r) !== k));
  const [, start] = useTransition();
  const restore = (r: DriveRow) =>
    start(async () => {
      haptic();
      hide(key(r));
      await undoDriveAction(r.account, r.id);
    });
  if (!visible.length) {
    return <p className="px-4 py-3 text-subhead text-muted-foreground">Nichts im Papierkorb.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {visible.map((r) => (
        <li key={key(r)} className="flex items-center gap-3 px-4 py-2">
          <FileIcon mime={r.mime} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body">{r.name}</p>
            <p className="truncate text-footnote text-muted-foreground">{subtitle(r)}</p>
          </div>
          <button
            type="button"
            onClick={() => restore(r)}
            aria-label={`„${r.name}“ wiederherstellen`}
            className="flex min-h-11 shrink-0 items-center gap-1 text-subhead font-medium text-tint-text active:opacity-60"
          >
            <RotateCcw className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Wiederherstellen</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DriveProtectedForm({ folders }: { folders: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDriveProtectedAction, null);
  return (
    <form action={action} className="space-y-2 px-4 py-3">
      <label htmlFor="folders" className="text-subhead text-muted-foreground">
        Ordner, die nie angefasst werden – einer pro Zeile, z. B. <span className="font-medium text-foreground">Schule</span> oder{" "}
        <span className="font-medium text-foreground">Fotos/Urlaub</span>. Unterordner sind eingeschlossen.
      </label>
      <textarea
        id="folders"
        name="folders"
        defaultValue={folders.join("\n")}
        rows={3}
        className="w-full rounded-[10px] bg-muted px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-full bg-muted px-4 text-subhead font-semibold text-tint-text active:opacity-60 disabled:opacity-50"
        >
          Speichern
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
