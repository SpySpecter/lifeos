import Link from "next/link";
import { loadGrades } from "@/integrations/loaders";
import { formatNote, formatPoints, neededInNextKlausur, semesterPoints } from "@/lib/grades";
import { cn } from "@/lib/utils";
import { WidgetCard } from "../widget-card";

/** Kurse mit den Punkten im aktuellen Halbjahr, Ziel-Hinweis und voraussichtlichem Abi-Schnitt. */
export async function GradesWidget({ className }: { className?: string }) {
  const { semester, courses, projection: p } = await loadGrades();
  return (
    <WidgetCard title="Noten" href="/noten" className={className}>
      {!courses.length ? (
        <div className="py-1 text-subhead text-muted-foreground">
          <p>Noch keine Kurse.</p>
          <Link href="/noten" className="flex min-h-11 items-center font-semibold text-tint-text">
            Kurse anlegen
          </Link>
        </div>
      ) : (
        <div className="-my-1">
          {p.note !== null ? (
            <p className="text-subhead text-muted-foreground tabular-nums">
              Abi-Schnitt <span className="font-heading text-title2 font-bold text-foreground">{formatNote(p.note)}</span>
              {p.average !== null ? ` · Ø ${formatPoints(p.average)} P.` : ""}
              {p.estimated ? " · geschätzt" : ""}
            </p>
          ) : null}
          <ul className="mt-2 ios-rows">
            {courses.map((c) => {
              const sp = semesterPoints(c, semester);
              const need = c.target && c.overrides[semester] === undefined ? neededInNextKlausur(c, semester, c.target) : null;
              return (
                <li key={c.id} className="flex min-h-11 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">
                      {c.subject} <span className="text-footnote text-muted-foreground">{c.kind}</span>
                    </span>
                    {need ? (
                      <span className={cn("block truncate text-footnote", need.status === "unerreichbar" ? "text-critical" : "text-muted-foreground")}>
                        {need.status === "braucht"
                          ? `für ${c.target}: nächste Klausur ≥ ${need.points} P.`
                          : need.status === "sicher"
                            ? `${c.target} P. sicher`
                            : `${c.target} P. nicht mehr drin`}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("text-title3 font-bold tabular-nums", sp && sp.points < 5 && "text-critical", !sp && "text-muted-foreground")}>
                    {sp ? sp.points : "–"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-footnote text-muted-foreground">Punkte in {semester}</p>
        </div>
      )}
    </WidgetCard>
  );
}
