import type { Lesson } from "webuntis";
import { describe, expect, it } from "vitest";
import { buildWeek, mapLesson, mergeBlocks } from "@/integrations/untis";

const lesson = (over: Partial<Lesson>): Lesson => ({
  id: 1,
  date: 20261012,
  startTime: 745,
  endTime: 830,
  kl: [],
  te: [{ id: 1, name: "Kr", longname: "Krause" }],
  su: [{ id: 1, name: "M", longname: "Mathematik" }],
  ro: [{ id: 1, name: "A204", longname: "A204" }],
  lsnumber: 1,
  ...over,
});

describe("mapLesson", () => {
  it("wandelt Untis-Datum und -Zeiten um", () => {
    expect(mapLesson(lesson({}))).toMatchObject({
      day: "2026-10-12",
      start: "07:45",
      end: "08:30",
      subject: "M",
      subjectLong: "Mathematik",
      teachers: ["Kr"],
      rooms: ["A204"],
      status: "regular",
      note: null,
    });
  });
  it("verträgt fehlende Lehrer-/Raum-/Fachlisten (Schülerkonten)", () => {
    const raw = lesson({});
    delete (raw as Partial<Lesson>).te;
    delete (raw as Partial<Lesson>).ro;
    const l = mapLesson(raw);
    expect(l.teachers).toEqual([]);
    expect(l.rooms).toEqual([]);
    const noSubject = lesson({ lstext: "Projekttag" });
    delete (noSubject as Partial<Lesson>).su;
    expect(mapLesson(noSubject).subject).toBe("Projekttag");
  });
  it("übernimmt Ausfall und Vertretungstext", () => {
    const l = mapLesson(lesson({ code: "cancelled", substText: "Fortbildung", info: "  " }));
    expect(l.status).toBe("cancelled");
    expect(l.note).toBe("Fortbildung");
  });
});

describe("mergeBlocks", () => {
  it("fasst Doppelstunden zusammen", () => {
    const merged = mergeBlocks([
      mapLesson(lesson({ startTime: 830, endTime: 915 })),
      mapLesson(lesson({ startTime: 745, endTime: 830 })),
      mapLesson(lesson({ startTime: 935, endTime: 1020, su: [{ id: 2, name: "D", longname: "Deutsch" }] })),
    ]);
    expect(merged.map((m) => `${m.subject} ${m.start}-${m.end}`)).toEqual(["M 07:45-09:15", "D 09:35-10:20"]);
  });
  it("trennt bei unterschiedlichem Status", () => {
    const merged = mergeBlocks([
      mapLesson(lesson({ startTime: 745, endTime: 830 })),
      mapLesson(lesson({ startTime: 830, endTime: 915, code: "cancelled" })),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("buildWeek", () => {
  it("verteilt auf Tage und sammelt Änderungen", () => {
    const week = buildWeek([mapLesson(lesson({ code: "irregular" })), mapLesson(lesson({ date: 20261013 }))], "2026-10-12", 7);
    expect(week.days).toHaveLength(7);
    expect(week.days[0].lessons).toHaveLength(1);
    expect(week.days[1].lessons).toHaveLength(1);
    expect(week.changes).toHaveLength(1);
  });
});

import { parseCourse } from "@/lib/courses";

describe("parseCourse", () => {
  it.each([
    ["LK If 1", "Informatik", "LK"],
    ["GK Pb 2", "Politische Bildung", "GK"],
    ["SK Sk 3", "Seminarkurs", "Seminarkurs"],
    ["GK Sp 1", "Sport", "GK"],
    ["LK Ma 1", "Mathematik", "LK"],
    ["GK Xy 1", "Xy 1", "GK"],
    ["M", "M", null],
    ["Ph", "Physik", null],
  ])("%s → %s (%s)", (raw, title, kind) => {
    expect(parseCourse(raw)).toMatchObject({ title, kind });
  });
});
