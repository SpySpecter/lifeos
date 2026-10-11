/**
 * Entscheidungslogik der Mail-Sortierung – ohne Netzwerk, vollständig testbar.
 *
 * Reihenfolge: Schutzregeln (markiert/wichtig/Sicherheit) → eigene bzw. gelernte Absender-Regeln → KI-Einordnung,
 * deren Vorschlag durch feste Sicherheitsgrenzen läuft (z. B. Schule/Finanzen werden nie gelöscht).
 */

export const CATEGORIES = [
  "wichtig",
  "schule",
  "persoenlich",
  "finanzen",
  "konto",
  "benachrichtigung",
  "newsletter",
  "social",
  "werbung",
  "spam",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type MailAction = "keep" | "archive" | "trash";

export const CATEGORY_LABEL: Record<Category, string> = {
  wichtig: "Wichtig",
  schule: "Schule",
  persoenlich: "Persönlich",
  finanzen: "Finanzen",
  konto: "Konto & Sicherheit",
  benachrichtigung: "Benachrichtigung",
  newsletter: "Newsletter",
  social: "Social",
  werbung: "Werbung",
  spam: "Spam",
};

/** Kategorien, die nie automatisch aus dem Posteingang verschwinden. */
const PROTECTED: Category[] = ["wichtig", "schule", "persoenlich", "finanzen", "konto"];
/** Nur diese Kategorien dürfen automatisch in den Papierkorb (Newsletter werden archiviert, nie gelöscht). */
const TRASHABLE: Category[] = ["werbung", "spam", "social"];

/** Finanz-Mails werden nach dieser Zeit archiviert (Mahnungen u. Ä. ausgenommen). */
export const FINANCE_ARCHIVE_DAYS = 14;
const FINANCE_URGENT = /(mahnung|zahlungserinnerung|überfällig|fehlgeschlagen|abgelehnt|rücklastschrift|payment failed|declined|overdue|action required|aktion erforderlich|frist)/i;

export function financeReadyToArchive(m: { subject: string; snippet: string; date: number }, now = Date.now()): boolean {
  return now - m.date > FINANCE_ARCHIVE_DAYS * 86_400_000 && !FINANCE_URGENT.test(`${m.subject} ${m.snippet}`);
}

export const THRESHOLDS = { trash: 0.85, archive: 0.7, ask: 0.6 };

export type MailMeta = {
  id: string;
  threadId: string | null;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: number;
  labels: string[];
  listUnsubscribe: boolean;
};

export type Rule = { matchType: "sender" | "domain"; pattern: string; action: MailAction; category: Category | null };

export type Decision = {
  category: Category | null;
  action: MailAction;
  /** "pending" = Nutzer entscheidet im Widget */
  status: "done" | "pending";
  confidence: number | null;
  reason: string;
  source: "schutz" | "regel" | "ki";
};

/** "Max <max@example.com>" → { name, email } */
export function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : from).trim().toLowerCase();
  const name = (m && m[1].trim()) || email.split("@")[0];
  return { name, email };
}

export const domainOf = (email: string) => email.split("@")[1] ?? "";

/** Schutzregeln, die vor allem anderen greifen. */
export function protection(mail: MailMeta): Decision | null {
  if (mail.labels.includes("STARRED")) {
    return { category: null, action: "keep", status: "done", confidence: null, reason: "Markiert (Stern)", source: "schutz" };
  }
  if (/^\s*(re|aw|antw|sv)\s*:/i.test(mail.subject)) {
    return { category: "persoenlich", action: "keep", status: "done", confidence: null, reason: "Antwort in einer Unterhaltung", source: "schutz" };
  }
  const text = `${mail.subject} ${mail.snippet}`.toLowerCase();
  if (/(sicherheitswarnung|security alert|neue anmeldung|new sign-?in|passwort|password|bestätigungscode|verification code|2fa|zwei-faktor|einmalcode|login code)/.test(text)) {
    return { category: "konto", action: "keep", status: "done", confidence: null, reason: "Sicherheits-/Konto-Mail", source: "schutz" };
  }
  return null;
}

export function matchRule(mail: MailMeta, rules: Rule[]): Rule | null {
  return (
    rules.find((r) => r.matchType === "sender" && r.pattern === mail.fromEmail) ??
    rules.find((r) => r.matchType === "domain" && r.pattern === domainOf(mail.fromEmail)) ??
    null
  );
}

export type AiVerdict = { category: Category; action: MailAction; confidence: number; reason: string };

/** Wendet die Sicherheitsgrenzen auf einen KI-Vorschlag an. */
export function applyPolicy(v: AiVerdict): Decision {
  const base = { category: v.category, confidence: v.confidence, reason: v.reason, source: "ki" as const };
  if (PROTECTED.includes(v.category)) return { ...base, action: "keep", status: "done" };
  if (v.confidence < THRESHOLDS.ask) return { ...base, action: v.action, status: "pending" };
  if (v.action === "trash") {
    if (!TRASHABLE.includes(v.category)) return { ...base, action: "archive", status: "done" };
    if (v.confidence < THRESHOLDS.trash) return { ...base, action: "trash", status: "pending" };
    return { ...base, action: "trash", status: "done" };
  }
  if (v.action === "archive" && v.confidence < THRESHOLDS.archive) return { ...base, action: "archive", status: "pending" };
  return { ...base, action: v.action, status: "done" };
}

/** Gmail-Kategorie als Hinweis für die KI (Google sortiert schon grob vor). */
export function gmailTab(labels: string[]): string {
  const tab = labels.find((l) => l.startsWith("CATEGORY_"));
  return tab ? tab.slice("CATEGORY_".length).toLowerCase() : "primary";
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
        required: ["i", "category", "action", "confidence", "reason"],
        properties: {
          i: { type: "integer" },
          category: { type: "string", enum: [...CATEGORIES] },
          action: { type: "string", enum: ["keep", "archive", "trash"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export function instructions(profile: string): string {
  return `Du sortierst den Gmail-Posteingang einer Person. Entscheide für jede Mail Kategorie und Aktion.

Über die Person und ihre Vorlieben:
${profile}

Aktionen:
- keep: bleibt im Posteingang (alles, was die Person lesen oder erledigen muss)
- archive: aus dem Posteingang nehmen, bleibt aber erhalten (Infos ohne Handlungsbedarf)
- trash: Papierkorb (Werbung, Spam, Unwichtiges, das niemand vermisst)

Kategorien: ${CATEGORIES.join(", ")}.
"confidence" zwischen 0 und 1: wie sicher du dir bist. Sei bei Mails von echten Menschen, Schule, Geld, Behörden und Konten vorsichtig (keep).
"reason": kurze Begründung auf Deutsch, höchstens 8 Wörter.
Antworte für JEDE Mail genau einmal mit ihrem Index i.`;
}

export function aiInput(mails: MailMeta[]): string {
  return JSON.stringify(
    mails.map((m, i) => ({
      i,
      from: m.fromName,
      email: m.fromEmail,
      subject: m.subject.slice(0, 200),
      preview: m.snippet.slice(0, 220),
      gmail_tab: gmailTab(m.labels),
      newsletter_header: m.listUnsubscribe,
    })),
  );
}
