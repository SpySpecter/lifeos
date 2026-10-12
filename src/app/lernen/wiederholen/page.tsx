import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewSession } from "@/components/flashcards";
import { PageHeader } from "@/components/page-header";
import { WidgetSkeleton } from "@/components/widget-card";
import { cardWindow } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { dueCards, getDeck } from "@/lib/flashcards";

export const metadata: Metadata = { title: "Wiederholen" };

async function ReviewContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { now, end } = await cardWindow();
  const params = await searchParams;
  const quick = params.modus === "quick";
  const deckId = Number(params.deck);
  const deck = Number.isInteger(deckId) && deckId > 0 ? getDeck(db(), deckId, now, end) : null;
  // Quick Learn: alle Karten des Stapels; sonst nur Fälliges (eines Stapels oder aller)
  const cards = quick ? (deck?.cards ?? []) : dueCards(db(), deck?.id ?? null, now, end);
  const back = deck ? { href: `/lernen/stapel?id=${deck.id}`, label: deck.title } : { href: "/lernen", label: "Lernen" };
  return (
    <>
      <PageHeader title={deck ? deck.title : "Alle fälligen Karten"} back={back} />
      <ReviewSession
        key={`${deck?.id ?? "alle"}-${quick}`}
        cards={cards}
        mode={quick ? "quick" : "fsrs"}
        backHref={back.href}
      />
    </>
  );
}

export default function ReviewPage({ searchParams }: PageProps<"/lernen/wiederholen">) {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Wiederholen" back={{ href: "/lernen", label: "Lernen" }} />
            <WidgetSkeleton lines={8} />
          </>
        }
      >
        <ReviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
