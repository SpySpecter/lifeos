/**
 * Entscheidungslogik für „Drive aufräumen“ – ohne Netzwerk, vollständig testbar.
 *
 * Reihenfolge: Schutz (nie anfassen) → sichere Regeln (Duplikate, leere und nie bearbeitete unbenannte Dateien) → KI.
 * Die KI darf nur mit sehr hoher Sicherheit „unnötig“ sagen; alles Unsichere wird Luis als Frage gezeigt.
 */

export type DriveFile = {
  id: string;
  name: string;
  mime: string;
  /** Ordnerpfad in der eigenen Ablage, "" = oberste Ebene oder unbekannt */
  path: string;
  size: number | null;
  md5: string | null;
  createdAt: number;
  modifiedAt: number;
  viewedAt: number | null;
  starred: boolean;
  shared: boolean;
  url: string;
};

export type Verdict = "relevant" | "unklar" | "unnoetig";

export type DriveDecision = {
  verdict: Verdict;
  confidence: number | null;
  reason: string;
  source: "schutz" | "regel" | "ki";
};

export const RECENT_DAYS = 90;
export const RECENT_REASON = "Kürzlich benutzt";
export const THRESHOLDS = { unnoetig: 0.9, relevant: 0.6 };

const DAY = 86_400_000;

/** Google-Typen, die mehr als eine Datei sind (Formular-Antworten, Websites, Skripte) – nie anfassen. */
const PROTECTED_MIME = [
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.script",
  "application/vnd.google-apps.jam",
];

/** Dateinamen, bei denen ein Irrtum teuer wäre. */
const IMPORTANT_NAME =
  /(zeugnis|vertrag|rechnung|quittung|beleg|steuer|versicherung|bewerbung|lebenslauf|ausweis|reisepass|personalausweis|urkunde|bescheinigung|attest|kontoauszug|passwort|password|backup|recovery|wiederherstellung)/i;

const UNTITLED =
  /^(unbenannte[sr]? (dokument|tabelle|präsentation|formular|zeichnung|projekt)|untitled( (document|spreadsheet|presentation|form|drawing|project))?)( \(\d+\))?$/i;

const norm = (s: string) => s.trim().toLowerCase();

/** Liegt die Datei in einem geschützten Ordner (auch in Unterordnern)? */
export function inProtectedFolder(path: string, protectedFolders: string[]): boolean {
  if (!path) return false;
  const parts = path.split("/").map(norm);
  return protectedFolders.some((p) => {
    const want = norm(p).replace(/^\/+|\/+$/g, "");
    if (!want) return false;
    // ganzer Pfad-Präfix ("Schule/Abi") oder ein einzelner Ordnername ("Abi")
    return want.includes("/") ? parts.join("/").startsWith(want) : parts.includes(want);
  });
}

export function protection(f: DriveFile, protectedFolders: string[], now = Date.now()): DriveDecision | null {
  const keep = (reason: string): DriveDecision => ({ verdict: "relevant", confidence: null, reason, source: "schutz" });
  if (f.starred) return keep("Markiert (Stern)");
  if (f.shared) return keep("Mit anderen geteilt");
  if (PROTECTED_MIME.includes(f.mime)) return keep("Formular, Website oder Skript");
  if (inProtectedFolder(f.path, protectedFolders)) return keep("Geschützter Ordner");
  if (now - Math.max(f.modifiedAt, f.viewedAt ?? 0) < RECENT_DAYS * DAY) return keep(RECENT_REASON);
  if (IMPORTANT_NAME.test(f.name)) return keep("Wichtiges Dokument");
  return null;
}

/**
 * Exakte Duplikate (gleicher Inhalt laut md5 und gleiche Größe): Die älteste Datei bleibt, die neueren Kopien sind unnötig.
 * Google-Dokumente haben keine Prüfsumme und werden hier nie als Duplikat erkannt.
 */
export function duplicates(files: DriveFile[]): Map<string, string> {
  const groups = new Map<string, DriveFile[]>();
  for (const f of files) {
    if (!f.md5 || !f.size) continue;
    const key = `${f.md5}|${f.size}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [original, ...copies] = [...group].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const where = original.path ? `in „${original.path}“` : "in der Ablage";
    for (const c of copies) out.set(c.id, `Doppelt – Original „${original.name}“ ${where}`);
  }
  return out;
}

/** Sichere Regeln für eindeutig unnötige Dateien. */
export function ruleVerdict(f: DriveFile, dupes: Map<string, string>): DriveDecision | null {
  const trash = (reason: string): DriveDecision => ({ verdict: "unnoetig", confidence: null, reason, source: "regel" });
  const dupe = dupes.get(f.id);
  if (dupe) return trash(dupe);
  const googleDoc = f.mime.startsWith("application/vnd.google-apps.");
  if (!googleDoc && f.size === 0) return trash("Leere Datei (0 Byte)");
  // Google speichert beim Anlegen sofort; „nie bearbeitet“ = innerhalb einer Minute nach dem Anlegen zuletzt geändert
  if (googleDoc && UNTITLED.test(f.name.trim()) && f.modifiedAt - f.createdAt < 60_000) {
    return trash("Unbenannt und nie bearbeitet");
  }
  return null;
}

export type AiDriveVerdict = { verdict: Verdict; confidence: number; reason: string };

const MEDIA = /^(image|video|audio)\//;

/** Sicherheitsgrenzen für einen KI-Vorschlag. */
export function applyDrivePolicy(v: AiDriveVerdict, f: Pick<DriveFile, "mime">): DriveDecision {
  const confidence = Math.max(0, Math.min(1, v.confidence));
  const base = { confidence, reason: v.reason, source: "ki" as const };
  if (v.verdict === "unnoetig" && confidence >= THRESHOLDS.unnoetig) {
    // Fotos und Videos lassen sich am Namen („IMG_2034.jpg“) nicht beurteilen – Luis entscheidet
    if (MEDIA.test(f.mime)) return { ...base, verdict: "unklar" };
    return { ...base, verdict: "unnoetig" };
  }
  if (v.verdict === "relevant" && confidence >= THRESHOLDS.relevant) return { ...base, verdict: "relevant" };
  return { ...base, verdict: "unklar" };
}

export const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "verdict", "confidence", "reason"],
        properties: {
          i: { type: "integer" },
          verdict: { type: "string", enum: ["relevant", "unklar", "unnoetig"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export type Example = { name: string; path: string; kept: boolean };

export function instructions(profile: string, examples: Example[]): string {
  const ex = examples.length
    ? `\nFrühere Entscheidungen der Person (daran orientieren):\n${examples
        .map((e) => `- ${e.kept ? "behalten" : "gelöscht"}: ${e.path ? `${e.path}/` : ""}${e.name}`)
        .join("\n")}\n`
    : "";
  return `Du hilfst beim Aufräumen eines Google Drive. Beurteile jede Datei nur anhand von Name, Typ, Ordner, Größe und Daten.

Über die Person:
${profile}
${ex}
Urteile:
- relevant: Schulunterlagen, eigene Arbeiten und Projekte, Dokumente zu Geld, Behörden, Bewerbungen, Erinnerungen (Fotos, Videos),
  alles, was die Person noch einmal brauchen oder vermissen könnte.
- unnoetig: offensichtlicher Datenmüll, z. B. Test-/Probedateien („test“, „asdf“, „Kopie von …“ ohne Inhaltssinn), alte
  Installationsdateien, temporäre Exporte, automatisch erzeugte Dateien ohne Wert. Nur wenn niemand sie vermissen würde.
- unklar: alles dazwischen – die Person wird gefragt.
"confidence" zwischen 0 und 1. Im Zweifel nie „unnoetig“: Eine falsch gelöschte Datei ist viel schlimmer als eine Frage.
"reason": kurze Begründung auf Deutsch, höchstens 8 Wörter.
Antworte für JEDE Datei genau einmal mit ihrem Index i.`;
}

const TYPE: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Tabelle",
  "application/vnd.google-apps.presentation": "Google Präsentation",
  "application/vnd.google-apps.drawing": "Google Zeichnung",
  "application/pdf": "PDF",
};

export function typeLabel(mime: string): string {
  if (TYPE[mime]) return TYPE[mime];
  if (mime.startsWith("image/")) return "Bild";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.includes("zip") || mime.includes("compressed")) return "Archiv";
  return mime.replace(/^application\/(vnd\.)?/, "");
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

export function aiInput(files: DriveFile[]): string {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return JSON.stringify(
    files.map((f, i) => ({
      i,
      name: f.name.slice(0, 160),
      type: typeLabel(f.mime),
      folder: f.path.slice(0, 120) || "/",
      size: formatSize(f.size) || undefined,
      created: day(f.createdAt),
      modified: day(f.modifiedAt),
      opened: f.viewedAt ? day(f.viewedAt) : "nie",
    })),
  );
}

/** Muss die Datei (erneut) bewertet werden? Unveränderte, schon bewertete Dateien werden übersprungen. */
export function needsReview(
  f: Pick<DriveFile, "modifiedAt">,
  known: { modifiedAt: number; decidedAt: number | null; reason: string; source: string; processedAt: number } | undefined,
  now = Date.now(),
): boolean {
  if (!known) return true;
  if (known.decidedAt) return false; // Luis hat entschieden – nie wieder fragen
  if (known.modifiedAt !== f.modifiedAt) return true;
  // „kürzlich benutzt“ gilt nur 90 Tage – danach einmal neu prüfen
  return known.source === "schutz" && known.reason === RECENT_REASON && now - known.processedAt > RECENT_DAYS * DAY;
}
