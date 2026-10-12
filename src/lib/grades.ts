import type { DB } from "./db";

/**
 * Noten in der Qualifikationsphase (Brandenburg, GOSTV): Halbjahresnoten aus Klausuren und sonstigen
 * Leistungen, „was brauche ich in der nächsten Klausur?“ und eine Hochrechnung der Gesamtqualifikation.
 *
 * - Block I: Halbjahresergebnisse, Leistungskurse doppelt; E_I = round(40 · P / S), höchstens 600.
 * - Block II: 5 Prüfungskomponenten × 4, höchstens 300.
 * - Durchschnittsnote nach KMK: N = (1020 − E) / 180, auf eine Nachkommastelle abgeschnitten, 1,0 bis 4,0.
 * Den Anteil der Klausuren legt die Schule fest – darum ist er pro Kurs einstellbar (Standard 50 %).
 */

export const SEMESTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export type Semester = (typeof SEMESTERS)[number];
export const GRADE_KINDS = ["klausur", "muendlich", "sonstig"] as const;
export type GradeKind = (typeof GRADE_KINDS)[number];
export type CourseKind = "LK" | "GK" | "SK";

export const KIND_LABEL: Record<GradeKind, string> = { klausur: "Klausur", muendlich: "Mündlich", sonstig: "Sonstige" };

export type Grade = { id: number; courseId: number; semester: Semester; kind: GradeKind; points: number; weight: number; label: string | null; day: string };
export type GradeCourse = {
  id: number;
  subject: string;
  kind: CourseKind;
  klausurWeight: number;
  target: number | null;
  examSlot: number | null;
  examExpected: number | null;
  grades: Grade[];
  overrides: Partial<Record<Semester, number>>;
};

// ---------------------------------------------------------------------------
// Rechnen (rein)

const weightedAvg = (gs: Pick<Grade, "points" | "weight">[]) => {
  const w = gs.reduce((n, g) => n + g.weight, 0);
  return w > 0 ? gs.reduce((n, g) => n + g.points * g.weight, 0) / w : null;
};

/** Halbjahresnote: Klausuren × Anteil + Rest × (1 − Anteil). Fehlt eine Seite, zählt die andere allein. */
export function semesterExact(grades: Pick<Grade, "kind" | "points" | "weight">[], klausurWeight: number): number | null {
  const k = weightedAvg(grades.filter((g) => g.kind === "klausur"));
  const o = weightedAvg(grades.filter((g) => g.kind !== "klausur"));
  if (k === null) return o;
  if (o === null) return k;
  return k * klausurWeight + o * (1 - klausurWeight);
}

/** Kaufmännisch gerundet (x,5 → auf). */
export const roundPoints = (x: number) => Math.min(15, Math.max(0, Math.floor(x + 0.5 + 1e-9)));

export function semesterPoints(c: Pick<GradeCourse, "grades" | "klausurWeight" | "overrides">, s: Semester): { points: number; exact: number; official: boolean } | null {
  const o = c.overrides[s];
  if (o !== undefined) return { points: o, exact: o, official: true };
  const exact = semesterExact(
    c.grades.filter((g) => g.semester === s),
    c.klausurWeight,
  );
  return exact === null ? null : { points: roundPoints(exact), exact, official: false };
}

export type Needed = { status: "sicher" } | { status: "unerreichbar"; best: number } | { status: "braucht"; points: number };

/**
 * Mindestpunkte in der nächsten Klausur (Gewicht 1), damit die Halbjahresnote gerundet `target` erreicht –
 * unter der Annahme, dass die übrigen Noten so bleiben.
 */
export function neededInNextKlausur(c: Pick<GradeCourse, "grades" | "klausurWeight">, s: Semester, target: number): Needed {
  const current = c.grades.filter((g) => g.semester === s);
  const result = (x: number) =>
    roundPoints(semesterExact([...current, { kind: "klausur", points: x, weight: 1 }], c.klausurWeight) ?? x);
  if (result(0) >= target) return { status: "sicher" };
  for (let x = 1; x <= 15; x++) if (result(x) >= target) return { status: "braucht", points: x };
  return { status: "unerreichbar", best: result(15) };
}

/** KMK-Tabelle als Formel. Unter 300 Punkten ist das Abitur nicht bestanden (null). */
export function abiNote(total: number): number | null {
  if (total < 300) return null;
  return Math.min(4, Math.max(1, Math.floor((1020 - total) / 18) / 10));
}

export type Projection = {
  /** Halbjahrespunkte je Kurs (eingetragen, offiziell oder geschätzt) */
  semesters: { courseId: number; semester: Semester; points: number; estimated: boolean }[];
  blockI: number;
  blockII: number;
  total: number;
  note: number | null;
  /** Block I/II enthalten Schätzungen (fehlende Halbjahre oder Prüfungen) */
  estimated: boolean;
  /** Halbjahresergebnisse unter 5 Punkten */
  under5: number;
  /** Durchschnitt der Halbjahrespunkte (LK doppelt) */
  average: number | null;
};

/**
 * Hochrechnung: Fehlende Halbjahre schätzt der Schnitt des Kurses, fehlende Prüfungen der Kursschnitt
 * bzw. der Gesamtschnitt. Eingebracht werden alle eingetragenen Kurse.
 */
export function projection(courses: GradeCourse[]): Projection {
  const semesters: Projection["semesters"] = [];
  let p = 0;
  let sCount = 0;
  const courseAvg = new Map<number, number>();
  for (const c of courses) {
    const known = SEMESTERS.map((s) => semesterPoints(c, s)).filter((x): x is NonNullable<typeof x> => x !== null);
    if (!known.length) continue;
    const avg = known.reduce((n, k) => n + k.points, 0) / known.length;
    courseAvg.set(c.id, avg);
    const factor = c.kind === "LK" ? 2 : 1;
    for (const s of SEMESTERS) {
      const sp = semesterPoints(c, s);
      const points = sp ? sp.points : roundPoints(avg);
      semesters.push({ courseId: c.id, semester: s, points, estimated: !sp });
      p += points * factor;
      sCount += factor;
    }
  }
  const average = sCount ? p / sCount : null;
  const blockI = sCount ? Math.round((40 * p) / sCount) : 0;

  let blockII = 0;
  let examEstimated = false;
  for (let slot = 1; slot <= 5; slot++) {
    const c = courses.find((x) => x.examSlot === slot);
    let points = c?.examExpected ?? null;
    if (points === null) {
      examEstimated = true;
      points = roundPoints((c ? courseAvg.get(c.id) : undefined) ?? average ?? 0);
    }
    blockII += points * 4;
  }
  const total = blockI + blockII;
  return {
    semesters,
    blockI,
    blockII,
    total,
    note: sCount ? abiNote(total) : null,
    estimated: examEstimated || semesters.some((s) => s.estimated),
    under5: semesters.filter((s) => !s.estimated && s.points < 5).length,
    average,
  };
}

export const formatNote = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatPoints = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/** Klausur aus dem Kalender einem Kurs zuordnen: gleicher Fachname (Anfang) und – falls angegeben – gleiche Kursart. */
export function matchCourse<T extends Pick<GradeCourse, "subject" | "kind">>(courses: T[], exam: { label: string; course: string | null }): T | undefined {
  const label = exam.label.toLowerCase();
  const kind = exam.course?.toUpperCase().match(/\b(LK|GK)\b/)?.[1];
  return courses.find((c) => {
    const s = c.subject.toLowerCase();
    const sameSubject = label.startsWith(s.slice(0, 5)) || s.startsWith(label.slice(0, 5));
    return sameSubject && (!kind || c.kind === kind);
  });
}

/** Kurzer Hinweis für eine anstehende Klausur, z. B. „für 12 P.: mind. 11 P.“ – null ohne Kurs/Ziel. */
export function examHint(courses: GradeCourse[], semester: Semester, exam: { label: string; course: string | null; kind: string }): string | null {
  if (!/klausur/i.test(exam.kind)) return null;
  const c = matchCourse(courses, exam);
  if (!c?.target || c.overrides[semester] !== undefined) return null;
  const n = neededInNextKlausur(c, semester, c.target);
  if (n.status === "sicher") return `${c.target} P. sind sicher`;
  if (n.status === "unerreichbar") return `${c.target} P. nicht mehr drin (max. ${n.best})`;
  return `für ${c.target} P.: mind. ${n.points} P.`;
}

// ---------------------------------------------------------------------------
// Datenbank

type CourseRow = {
  id: number;
  subject: string;
  kind: CourseKind;
  klausur_weight: number;
  target: number | null;
  exam_slot: number | null;
  exam_expected: number | null;
};

export function listGradeCourses(db: DB): GradeCourse[] {
  const rows = db.prepare("SELECT * FROM grade_courses ORDER BY kind = 'LK' DESC, position, subject").all() as CourseRow[];
  const grades = db
    .prepare("SELECT id, course_id AS courseId, semester, kind, points, weight, label, day FROM grades ORDER BY day, id")
    .all() as Grade[];
  const overrides = db.prepare("SELECT course_id, semester, points FROM grade_overrides").all() as { course_id: number; semester: Semester; points: number }[];
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    kind: r.kind,
    klausurWeight: r.klausur_weight,
    target: r.target,
    examSlot: r.exam_slot,
    examExpected: r.exam_expected,
    grades: grades.filter((g) => g.courseId === r.id).map((g) => ({ ...g })),
    overrides: Object.fromEntries(overrides.filter((o) => o.course_id === r.id).map((o) => [o.semester, o.points])),
  }));
}

export function addGradeCourse(db: DB, c: { subject: string; kind: CourseKind }, now = Date.now()): number {
  const { pos } = db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM grade_courses").get() as { pos: number };
  return Number(
    db.prepare("INSERT INTO grade_courses (subject, kind, position, created_at) VALUES (?, ?, ?, ?)").run(c.subject.trim().slice(0, 60), c.kind, pos, now)
      .lastInsertRowid,
  );
}

/** Kurse übernehmen, die es noch nicht gibt (gleiches Fach und gleiche Kursart). */
export function importGradeCourses(db: DB, courses: { subject: string; kind: CourseKind }[]): number {
  const existing = new Set(listGradeCourses(db).map((c) => `${c.subject.toLowerCase()}|${c.kind}`));
  let n = 0;
  for (const c of courses) {
    const key = `${c.subject.toLowerCase()}|${c.kind}`;
    if (existing.has(key)) continue;
    existing.add(key);
    addGradeCourse(db, c);
    n++;
  }
  return n;
}

export function updateGradeCourse(
  db: DB,
  id: number,
  c: { subject: string; kind: CourseKind; klausurWeight: number; target: number | null; examSlot: number | null; examExpected: number | null },
): void {
  // ein Prüfungsfach-Platz gehört genau einem Kurs
  if (c.examSlot) db.prepare("UPDATE grade_courses SET exam_slot = NULL WHERE exam_slot = ? AND id <> ?").run(c.examSlot, id);
  db.prepare("UPDATE grade_courses SET subject = ?, kind = ?, klausur_weight = ?, target = ?, exam_slot = ?, exam_expected = ? WHERE id = ?").run(
    c.subject.trim().slice(0, 60),
    c.kind,
    c.klausurWeight,
    c.target,
    c.examSlot,
    c.examExpected,
    id,
  );
}

export function deleteGradeCourse(db: DB, id: number): void {
  db.prepare("DELETE FROM grade_courses WHERE id = ?").run(id);
}

export function addGrade(
  db: DB,
  g: { courseId: number; semester: Semester; kind: GradeKind; points: number; weight?: number; label?: string | null; day: string },
  now = Date.now(),
): number {
  return Number(
    db
      .prepare("INSERT INTO grades (course_id, semester, kind, points, weight, label, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(g.courseId, g.semester, g.kind, g.points, g.weight ?? 1, g.label?.trim() || null, g.day, now).lastInsertRowid,
  );
}

export function deleteGrade(db: DB, id: number): void {
  db.prepare("DELETE FROM grades WHERE id = ?").run(id);
}

export function setOverride(db: DB, courseId: number, semester: Semester, points: number | null): void {
  if (points === null) db.prepare("DELETE FROM grade_overrides WHERE course_id = ? AND semester = ?").run(courseId, semester);
  else
    db.prepare("INSERT INTO grade_overrides (course_id, semester, points) VALUES (?, ?, ?) ON CONFLICT(course_id, semester) DO UPDATE SET points = excluded.points").run(
      courseId,
      semester,
      points,
    );
}

/** Noten, die in einem Zeitraum eingetragen wurden (für den Wochenrückblick). */
export function gradesBetween(db: DB, from: string, to: string): (Grade & { subject: string; courseKind: CourseKind })[] {
  return (
    db
      .prepare(
        "SELECT g.id, g.course_id AS courseId, g.semester, g.kind, g.points, g.weight, g.label, g.day, c.subject, c.kind AS courseKind " +
          "FROM grades g JOIN grade_courses c ON c.id = g.course_id WHERE g.day >= ? AND g.day <= ? ORDER BY g.day",
      )
      .all(from, to) as (Grade & { subject: string; courseKind: CourseKind })[]
  ).map((g) => ({ ...g }));
}
