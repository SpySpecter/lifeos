import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCourseForm, GradeCourseCard, SemesterPicker, type CourseView } from "@/components/grades";
import { PageHeader } from "@/components/page-header";
import { WidgetCard, WidgetSkeleton } from "@/components/widget-card";
import { loadSettings } from "@/integrations/loaders";
import { db } from "@/lib/db";
import { formatNote, formatPoints, listGradeCourses, neededInNextKlausur, projection, SEMESTERS, semesterPoints } from "@/lib/grades";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Noten" };

function Stat({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: "critical" }) {
  return (
    <div className="rounded-[14px] bg-muted/60 p-3">
      <p className="text-footnote font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-heading text-title1 leading-none font-bold tabular-nums", tone === "critical" && "text-critical")}>{value}</p>
      <p className="mt-1 text-caption text-muted-foreground">{caption}</p>
    </div>
  );
}

async function GradesContent() {
  const { gradeSemester: semester } = await loadSettings();
  const courses = listGradeCourses(db());
  const p = projection(courses);
  const views: CourseView[] = courses.map((c) => ({
    id: c.id,
    subject: c.subject,
    kind: c.kind,
    klausurWeight: c.klausurWeight,
    target: c.target,
    examSlot: c.examSlot,
    examExpected: c.examExpected,
    semesters: Object.fromEntries(SEMESTERS.map((s) => [s, semesterPoints(c, s)])) as CourseView["semesters"],
    grades: c.grades.filter((g) => g.semester === semester).map(({ id, kind, points, label, day, weight }) => ({ id, kind, points, label, day, weight })),
    needed: c.target && !c.overrides[semester] ? neededInNextKlausur(c, semester, c.target) : null,
  }));
  return (
    <>
      <div className="flex justify-end">
        <SemesterPicker value={semester} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {views.length ? (
              views.map((c) => <GradeCourseCard key={c.id} course={c} semester={semester} />)
            ) : (
              <p className="rounded-[20px] bg-card p-4 text-subhead text-muted-foreground md:col-span-2">Noch keine Kurse – unten anlegen oder aus dem Stundenplan übernehmen.</p>
            )}
          </div>
          <WidgetCard title="Kurs hinzufügen">
            <AddCourseForm />
          </WidgetCard>
        </div>
        <div className="order-first space-y-6 lg:order-none">
          <WidgetCard
            title="Hochrechnung Abitur"
            footer={
              <>
                Block I: alle eingetragenen Kurse, LK doppelt, E = 40 · P / S. Block II: 5 Prüfungen × 4. Fehlende Halbjahre und Prüfungen werden mit dem Kursschnitt
                geschätzt. Welche Kurse eingebracht werden, legt am Ende die Schule fest.
              </>
            }
          >
            {p.average === null ? (
              <p className="text-subhead text-muted-foreground">Sobald Noten eingetragen sind, steht hier der voraussichtliche Abi-Schnitt.</p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-footnote font-medium text-muted-foreground">Abi-Schnitt{p.estimated ? " (geschätzt)" : ""}</p>
                    <p className="font-heading text-[3.5rem] leading-none font-bold tracking-tight tabular-nums">{p.note === null ? "–" : formatNote(p.note)}</p>
                  </div>
                  <p className="pb-1 text-right text-subhead text-muted-foreground tabular-nums">
                    Ø {formatPoints(p.average)} P.
                    <br />
                    {p.total} von 900
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Stat label="Block I" value={String(p.blockI)} caption="von 600 · mind. 200" tone={p.blockI < 200 ? "critical" : undefined} />
                  <Stat label="Block II" value={String(p.blockII)} caption="von 300 · mind. 100" tone={p.blockII < 100 ? "critical" : undefined} />
                </div>
                {p.under5 ? (
                  <p className="mt-3 text-subhead font-medium text-critical">
                    ⚠ {p.under5} {p.under5 === 1 ? "Halbjahr" : "Halbjahre"} unter 5 Punkten
                  </p>
                ) : null}
              </>
            )}
          </WidgetCard>
        </div>
      </div>
    </>
  );
}

export default function GradesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Noten" back={{ href: "/schule", label: "Schule" }} />
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <GradesContent />
      </Suspense>
    </div>
  );
}
