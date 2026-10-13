import type { Metadata } from "next";
import { Repeat, Zap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddCardForm, CardRow, DeckSettings } from "@/components/flashcards";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { cardWindow } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { getDeck, type Flashcard } from "@/lib/flashcards";
import { intervalLabel } from "@/lib/fsrs";

export const metadata: Metadata = { title: "Karteikarten" };

function cardStatus(c: Flashcard, now: number): string {
  if (c.state === 0) return "neu";
  if (c.due <= now) return "fällig";
  return `in ${intervalLabel(c.due - now)}`;
}

async function DeckContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { now, end, newLeft } = await cardWindow();
  const deckId = Number((await searchParams).id);
  const deck = Number.isInteger(deckId) && deckId > 0 ? getDeck(db(), deckId, now, end, newLeft) : null;
  if (!deck) notFound();
  return (
    <>
      <PageHeader title={deck.title} back={{ href: "/lernen", label: "Lernen" }} />
      <div className="flex flex-wrap gap-2">
        <Link href={`/lernen/wiederholen?deck=${deck.id}`} aria-disabled={!deck.due} className={buttonVariants({ className: !deck.due ? "pointer-events-none opacity-50" : undefined })}>
          <Repeat aria-hidden />
          {deck.due ? `${deck.due} wiederholen` : "Nichts fällig"}
        </Link>
        <Link
          href={`/lernen/wiederholen?deck=${deck.id}&modus=quick`}
          aria-disabled={!deck.total}
          className={buttonVariants({ variant: "outline", className: !deck.total ? "pointer-events-none opacity-50" : undefined })}
        >
          <Zap aria-hidden />
          Quick Learn
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <WidgetCard title={`${deck.total} Karten`} footer={deck.total ? "Antippen zum Bearbeiten." : undefined}>
          {deck.cards.length ? (
            <ul className="-my-2.5 ios-rows">
              {deck.cards.map((c) => (
                <CardRow key={c.id} card={{ id: c.id, front: c.front, back: c.back }} status={cardStatus(c, now)} />
              ))}
            </ul>
          ) : (
            <p className="py-1 text-subhead text-muted-foreground">Noch leer – rechts die erste Karte anlegen.</p>
          )}
        </WidgetCard>
        <div className="space-y-6">
          <WidgetCard title="Neue Karte">
            <AddCardForm deckId={deck.id} />
          </WidgetCard>
          <WidgetCard title="Stapel">
            <DeckSettings deck={{ id: deck.id, title: deck.title, subject: deck.subject }} />
          </WidgetCard>
        </div>
      </div>
    </>
  );
}

// Stapel-ID als Query-Parameter (wie beim Lernplan), damit die Navigation vorgerendert bleibt.
export default function DeckPage({ searchParams }: PageProps<"/lernen/stapel">) {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Karteikarten" back={{ href: "/lernen", label: "Lernen" }} />
            <WidgetSkeleton lines={8} />
          </>
        }
      >
        <DeckContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
