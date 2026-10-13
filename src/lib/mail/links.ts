/**
 * Wohin ein Tipp auf eine Mail führt. Auf iPhone/iPad öffnet „Apple Mail“ genau diese Mail über ihre
 * Message-ID (`message:<…>`, das Konto muss in der Mail-App eingerichtet sein); die Gmail-App hat keinen
 * offiziellen Link auf einzelne Mails und wird daher nur geöffnet. Ohne Message-ID oder am Rechner bleibt es Gmail im Browser.
 */

export const MAIL_APPS = ["mail", "gmail", "web"] as const;
export type MailApp = (typeof MAIL_APPS)[number];

export const MAIL_APP_LABEL: Record<MailApp, string> = { mail: "Apple Mail", gmail: "Gmail-App", web: "Browser" };

/** Message-ID-Header („<abc@host>“, manchmal ohne Klammern oder mit Leerraum) → `message:`-URL. */
export function appleMailUrl(messageId: string): string | null {
  const id = messageId.trim().replace(/^<|>$/g, "").trim();
  if (!id || /\s/.test(id)) return null;
  return `message:${encodeURIComponent(`<${id}>`)}`;
}

/** Link für eine Mail; `null` heißt: im Browser öffnen (`webUrl`). */
export function mailAppUrl(app: MailApp, messageId: string | null | undefined): string | null {
  if (app === "gmail") return "googlegmail://";
  if (app === "mail" && messageId) return appleMailUrl(messageId);
  return null;
}
