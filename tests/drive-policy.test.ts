import { describe, expect, it } from "vitest";
import { processFiles, type DriveSummary } from "@/lib/drive/cleanup";
import { folderPaths } from "@/lib/drive/api";
import {
  applyDrivePolicy,
  type DriveDecision,
  type DriveFile,
  duplicates,
  inProtectedFolder,
  needsReview,
  protection,
  ruleVerdict,
} from "@/lib/drive/policy";
import { memoryDb } from "./support/db";

const NOW = Date.parse("2026-10-12T10:00:00Z");
const DAY = 86_400_000;
const OLD = NOW - 400 * DAY;

function file(over: Partial<DriveFile> & { id: string }): DriveFile {
  return {
    name: `${over.id}.pdf`,
    mime: "application/pdf",
    path: "",
    size: 1000,
    md5: null,
    createdAt: OLD,
    modifiedAt: OLD,
    viewedAt: null,
    starred: false,
    shared: false,
    url: `https://drive.google.com/file/d/${over.id}/view`,
    ...over,
  };
}

const summary = (): DriveSummary => ({ accounts: 0, scanned: 0, skipped: 0, relevant: 0, unklar: 0, trashed: 0, notes: [] });

describe("Schutzregeln", () => {
  it("markierte, geteilte, kürzlich benutzte und wichtige Dateien bleiben", () => {
    expect(protection(file({ id: "a", starred: true }), [], NOW)?.reason).toBe("Markiert (Stern)");
    expect(protection(file({ id: "b", shared: true }), [], NOW)?.reason).toBe("Mit anderen geteilt");
    expect(protection(file({ id: "c", viewedAt: NOW - 10 * DAY }), [], NOW)?.reason).toBe("Kürzlich benutzt");
    expect(protection(file({ id: "d", modifiedAt: NOW - 89 * DAY }), [], NOW)?.verdict).toBe("relevant");
    expect(protection(file({ id: "e", mime: "application/vnd.google-apps.form" }), [], NOW)).not.toBeNull();
    expect(protection(file({ id: "f", name: "Zeugnis 10. Klasse.pdf" }), [], NOW)?.reason).toBe("Wichtiges Dokument");
    expect(protection(file({ id: "g", name: "asdf.txt" }), [], NOW)).toBeNull();
    expect(protection(file({ id: "h", modifiedAt: NOW - 91 * DAY }), [], NOW)).toBeNull();
  });

  it("geschützte Ordner gelten auch für Unterordner, als Name oder als Pfad", () => {
    expect(inProtectedFolder("Schule/Abi/Mathe", ["abi"])).toBe(true);
    expect(inProtectedFolder("Schule/Abi/Mathe", ["Schule/Abi"])).toBe(true);
    expect(inProtectedFolder("Schule/Abitur", ["Schule/Abi/"])).toBe(true); // Präfix – lieber zu viel schützen
    expect(inProtectedFolder("Privat/Abi", ["Schule/Abi"])).toBe(false);
    expect(inProtectedFolder("", ["Abi"])).toBe(false);
    expect(protection(file({ id: "x", path: "Fotos/Urlaub" }), ["Fotos"], NOW)?.reason).toBe("Geschützter Ordner");
  });
});

describe("Regeln für Unnötiges", () => {
  it("Duplikate: die älteste Datei bleibt, die neueren Kopien sind unnötig", () => {
    const files = [
      file({ id: "copy2", md5: "m", createdAt: OLD + 2 * DAY }),
      file({ id: "orig", md5: "m", createdAt: OLD, path: "Schule" }),
      file({ id: "copy1", md5: "m", createdAt: OLD + DAY }),
      file({ id: "other", md5: "n" }),
      file({ id: "otherSize", md5: "m", size: 5 }),
      file({ id: "empty1", md5: "d41d8", size: 0 }),
      file({ id: "empty2", md5: "d41d8", size: 0 }),
    ];
    const d = duplicates(files);
    expect([...d.keys()].sort()).toEqual(["copy1", "copy2"]);
    expect(d.get("copy1")).toContain("„orig.pdf“ in „Schule“");
  });

  it("leere Dateien und nie bearbeitete unbenannte Dokumente", () => {
    const none = new Map<string, string>();
    expect(ruleVerdict(file({ id: "e", size: 0 }), none)?.reason).toBe("Leere Datei (0 Byte)");
    const doc = { mime: "application/vnd.google-apps.document", size: null };
    expect(ruleVerdict(file({ id: "u", name: "Unbenanntes Dokument", ...doc, modifiedAt: OLD + 5_000 }), none)?.verdict).toBe("unnoetig");
    expect(ruleVerdict(file({ id: "u2", name: "Untitled spreadsheet (3)", ...doc, mime: "application/vnd.google-apps.spreadsheet" }), none)).not.toBeNull();
    // unbenannt, aber bearbeitet → die KI bzw. Luis entscheidet
    expect(ruleVerdict(file({ id: "u3", name: "Unbenanntes Dokument", ...doc, modifiedAt: OLD + DAY }), none)).toBeNull();
    // Google-Dokumente ohne Größe sind nicht „leer“
    expect(ruleVerdict(file({ id: "g", ...doc, size: 0 }), none)).toBeNull();
  });
});

describe("KI-Schwellen", () => {
  const pdf = { mime: "application/pdf" };
  it("unnötig nur ab 0.9, relevant ab 0.6, sonst Frage", () => {
    expect(applyDrivePolicy({ verdict: "unnoetig", confidence: 0.95, reason: "" }, pdf).verdict).toBe("unnoetig");
    expect(applyDrivePolicy({ verdict: "unnoetig", confidence: 0.89, reason: "" }, pdf).verdict).toBe("unklar");
    expect(applyDrivePolicy({ verdict: "relevant", confidence: 0.6, reason: "" }, pdf).verdict).toBe("relevant");
    expect(applyDrivePolicy({ verdict: "relevant", confidence: 0.5, reason: "" }, pdf).verdict).toBe("unklar");
    expect(applyDrivePolicy({ verdict: "unnoetig", confidence: 7, reason: "" }, pdf).confidence).toBe(1);
  });

  it("Fotos und Videos landen nie automatisch im Papierkorb", () => {
    expect(applyDrivePolicy({ verdict: "unnoetig", confidence: 0.99, reason: "" }, { mime: "image/jpeg" }).verdict).toBe("unklar");
  });
});

describe("needsReview", () => {
  const known = { modifiedAt: OLD, decidedAt: null, reason: "KI", source: "ki", processedAt: NOW - DAY };
  it("überspringt unveränderte und von Luis entschiedene Dateien", () => {
    expect(needsReview({ modifiedAt: OLD }, undefined, NOW)).toBe(true);
    expect(needsReview({ modifiedAt: OLD }, known, NOW)).toBe(false);
    expect(needsReview({ modifiedAt: OLD + 1 }, known, NOW)).toBe(true);
    expect(needsReview({ modifiedAt: OLD + 1 }, { ...known, decidedAt: NOW }, NOW)).toBe(false);
  });
  it("prüft „kürzlich benutzt“ nach 90 Tagen erneut", () => {
    const recent = { ...known, source: "schutz", reason: "Kürzlich benutzt" };
    expect(needsReview({ modifiedAt: OLD }, recent, NOW)).toBe(false);
    expect(needsReview({ modifiedAt: OLD }, { ...recent, processedAt: NOW - 91 * DAY }, NOW)).toBe(true);
  });
});

it("folderPaths löst verschachtelte Ordner auf", () => {
  const p = folderPaths([
    { id: "c", name: "Mathe", parents: ["b"] },
    { id: "b", name: "Schule", parents: ["root"] },
    { id: "loop", name: "Kreis", parents: ["loop"] },
  ]);
  expect(p.get("c")).toBe("Schule/Mathe");
  expect(p.get("b")).toBe("Schule");
  expect(p.get("loop")).toBeTypeOf("string"); // kein Endlos-Rekursion
});

describe("processFiles", () => {
  const files = [
    file({ id: "starred", starred: true }),
    file({ id: "orig", md5: "m" }),
    file({ id: "dupe", md5: "m", createdAt: OLD + DAY }),
    file({ id: "junk", name: "test123.txt" }),
    file({ id: "unsure", name: "Notizen.docx" }),
    file({ id: "keep", name: "Referat Geschichte.pptx" }),
  ];
  const ai = new Map<string, DriveDecision>([
    ["junk", { verdict: "unnoetig", confidence: 0.95, reason: "Testdatei", source: "ki" }],
    ["unsure", { verdict: "unklar", confidence: 0.5, reason: "?", source: "ki" }],
    ["keep", { verdict: "relevant", confidence: 0.9, reason: "Schule", source: "ki" }],
  ]);

  it("legt Unnötiges in den Papierkorb, fragt bei Unklarem und überspringt beim zweiten Lauf alles", async () => {
    const db = memoryDb();
    const trashed: string[] = [];
    const sentToAi: string[][] = [];
    const deps = {
      trash: async (id: string) => void trashed.push(id),
      classify: async (fs: DriveFile[]) => {
        sentToAi.push(fs.map((f) => f.id));
        return new Map(fs.flatMap((f) => (ai.has(f.id) ? [[f.id, ai.get(f.id)!] as const] : [])));
      },
    };
    const s = summary();
    await processFiles(db, "luis@example.com", files, deps, s, { protectedFolders: [], now: NOW });
    expect(trashed.sort()).toEqual(["dupe", "junk"]);
    expect(sentToAi).toEqual([["orig", "junk", "unsure", "keep"]]);
    expect(s).toMatchObject({ scanned: 6, skipped: 0, trashed: 2, unklar: 1, relevant: 2 });
    // "orig" hat die KI nicht beantwortet → bleibt unbewertet und kommt beim nächsten Lauf wieder dran
    const statuses = Object.fromEntries(
      (db.prepare("SELECT id, status FROM drive_items").all() as { id: string; status: string }[]).map((r) => [r.id, r.status]),
    );
    expect(statuses).toEqual({ starred: "behalten", dupe: "papierkorb", junk: "papierkorb", unsure: "offen", keep: "behalten" });

    // zweiter Lauf: Papierkorb-Dateien tauchen nicht mehr auf, alles andere ist bekannt
    const s2 = summary();
    sentToAi.length = 0;
    const remaining = files.filter((f) => !["dupe", "junk"].includes(f.id));
    await processFiles(db, "luis@example.com", remaining, deps, s2, { protectedFolders: [], now: NOW });
    expect(sentToAi).toEqual([["orig"]]);
    expect(s2.skipped).toBe(3);
    expect(trashed).toHaveLength(2);
  });

  it("in Drive selbst wiederhergestellte Dateien werden nie wieder angefasst", async () => {
    const db = memoryDb();
    const trashed: string[] = [];
    const deps = {
      trash: async (id: string) => void trashed.push(id),
      classify: async () => new Map([["junk", ai.get("junk")!]]),
    };
    const junk = files.filter((f) => f.id === "junk");
    await processFiles(db, "a", junk, deps, summary(), { protectedFolders: [], now: NOW });
    expect(trashed).toEqual(["junk"]);
    // Luis holt sie in Drive zurück, sie taucht wieder in der Liste auf (sogar geändert)
    await processFiles(db, "a", [{ ...junk[0], modifiedAt: OLD + DAY }], deps, summary(), { protectedFolders: [], now: NOW });
    expect(trashed).toEqual(["junk"]);
    expect((db.prepare("SELECT status FROM drive_items WHERE id = 'junk'").get() as { status: string }).status).toBe("wiederhergestellt");
  });

  it("ein fehlgeschlagener Papierkorb-Aufruf wird notiert und nicht gespeichert", async () => {
    const db = memoryDb();
    const s = summary();
    await processFiles(
      db,
      "a",
      [file({ id: "e", size: 0 })],
      { trash: async () => Promise.reject(new Error("Drive 403: insufficient")), classify: async () => new Map() },
      s,
      { protectedFolders: [], now: NOW },
    );
    expect(s.trashed).toBe(0);
    expect(s.notes[0]).toContain("Drive 403");
    expect(db.prepare("SELECT COUNT(*) AS n FROM drive_items").get()).toMatchObject({ n: 0 });
  });

  it("bricht die KI ab (Budget), bleiben die Dateien unbewertet", async () => {
    const db = memoryDb();
    const s = summary();
    await processFiles(
      db,
      "a",
      [file({ id: "x" })],
      { trash: async () => {}, classify: async () => Promise.reject(new Error("KI-Monatsbudget von 5 $ erreicht")) },
      s,
      { protectedFolders: [], now: NOW },
    );
    expect(s.notes).toEqual(["KI-Monatsbudget von 5 $ erreicht"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM drive_items").get()).toMatchObject({ n: 0 });
  });
});
