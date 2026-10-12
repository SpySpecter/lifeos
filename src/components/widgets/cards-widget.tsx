import { ChevronRight, Repeat } from "lucide-react";
import Link from "next/link";
import { loadDecks } from "@/integrations/loaders";
import { cn } from "@/lib/utils";
import { WidgetCard } from "../widget-card";

/** Fällige Karteikarten pro Stapel, ein Tipp startet die Wiederholung. */
export async function CardsWidget({ className }: { className?: string }) {
  const decks = await loadDecks();
  const due = decks.reduce((n, d) => n + d.due, 0);
  const open = decks.filter((d) => d.due);
  return (
    <WidgetCard title="Karteikarten" href="/lernen" hrefLabel="Lernen" className={className}>
      {!decks.length ? (
        <p className="py-1 text-subhead text-muted-foreground">Noch keine Stapel – unter „Lernen“ aus Material erzeugen.</p>
      ) : (
        <div className="-my-1">
          <Link
            href="/lernen/wiederholen"
            aria-disabled={!due}
            className={cn("flex min-h-12 items-center gap-3 rounded-[14px] px-3 active:opacity-70", due ? "bg-tint text-white" : "pointer-events-none bg-muted text-muted-foreground")}
          >
            <Repeat className="size-5 shrink-0" aria-hidden />
            <span className="flex-1 text-body font-semibold tabular-nums">{due ? `${due} ${due === 1 ? "Karte" : "Karten"} fällig` : "Alles wiederholt 🎉"}</span>
            {due ? <ChevronRight className="size-5" aria-hidden /> : null}
          </Link>
          {open.length > 1 ? (
            <ul className="mt-2 ios-rows">
              {open.map((d) => (
                <li key={d.id}>
                  <Link href={`/lernen/wiederholen?deck=${d.id}`} className="-mx-4 flex min-h-11 items-center gap-2 px-4 active:bg-muted">
                    <span className="min-w-0 flex-1 truncate text-body">{d.title}</span>
                    <span className="text-subhead text-muted-foreground tabular-nums">{d.due}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </WidgetCard>
  );
}
