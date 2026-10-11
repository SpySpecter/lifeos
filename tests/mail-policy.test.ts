import { describe, expect, it } from "vitest";
import { AI_SCHEMA, aiInput, applyPolicy, gmailTab, type MailMeta, matchRule, parseFrom, protection } from "@/lib/mail/policy";

const mail = (over: Partial<MailMeta> = {}): MailMeta => ({
  id: "m1",
  threadId: "t1",
  fromName: "Shop",
  fromEmail: "news@shop.de",
  subject: "Nur heute -30 %",
  snippet: "Jetzt zuschlagen",
  date: 0,
  labels: ["INBOX", "CATEGORY_PROMOTIONS"],
  listUnsubscribe: true,
  ...over,
});

describe("parseFrom", () => {
  it.each([
    ['"Max Muster" <Max@Example.com>', "Max Muster", "max@example.com"],
    ["Shop <news@shop.de>", "Shop", "news@shop.de"],
    ["solo@x.de", "solo", "solo@x.de"],
    ["<noreply@github.com>", "noreply", "noreply@github.com"],
  ])("%s", (input, name, email) => {
    expect(parseFrom(input)).toEqual({ name, email });
  });
});

describe("Schutzregeln", () => {
  it("fasst markierte Mails nie an", () => {
    expect(protection(mail({ labels: ["INBOX", "STARRED"] }))).toMatchObject({ action: "keep", source: "schutz" });
  });
  it("behält Sicherheits- und Login-Mails", () => {
    expect(protection(mail({ subject: "Security alert: new sign-in" }))).toMatchObject({ category: "konto", action: "keep" });
    expect(protection(mail({ subject: "Dein Bestätigungscode" }))).toMatchObject({ action: "keep" });
  });
  it("greift bei normalen Mails nicht", () => {
    expect(protection(mail())).toBeNull();
  });
});

describe("Absender-Regeln", () => {
  const rules = [
    { matchType: "domain" as const, pattern: "shop.de", action: "trash" as const, category: "werbung" as const },
    { matchType: "sender" as const, pattern: "news@shop.de", action: "archive" as const, category: "newsletter" as const },
  ];
  it("Absender schlägt Domain", () => {
    expect(matchRule(mail(), rules)?.action).toBe("archive");
  });
  it("Domain greift für andere Absender", () => {
    expect(matchRule(mail({ fromEmail: "deals@shop.de" }), rules)?.action).toBe("trash");
  });
  it("keine Regel → null", () => {
    expect(matchRule(mail({ fromEmail: "a@b.de" }), rules)).toBeNull();
  });
});

describe("applyPolicy (Sicherheitsgrenzen für KI-Vorschläge)", () => {
  const v = (category: string, action: string, confidence: number) =>
    applyPolicy({ category: category as never, action: action as never, confidence, reason: "x" });

  it("löscht eindeutige Werbung automatisch", () => {
    expect(v("werbung", "trash", 0.95)).toMatchObject({ action: "trash", status: "done" });
  });
  it("fragt nach, wenn Löschen nicht sicher genug ist", () => {
    expect(v("werbung", "trash", 0.75)).toMatchObject({ action: "trash", status: "pending" });
  });
  it("löscht nie geschützte Kategorien – egal wie sicher", () => {
    for (const c of ["schule", "finanzen", "konto", "persoenlich", "wichtig"]) {
      expect(v(c, "trash", 0.99)).toMatchObject({ action: "keep", status: "done" });
    }
  });
  it("archiviert statt zu löschen, wenn die Kategorie nicht löschbar ist", () => {
    expect(v("benachrichtigung", "trash", 0.99)).toMatchObject({ action: "archive", status: "done" });
  });
  it("unsichere Fälle landen im Widget", () => {
    expect(v("newsletter", "archive", 0.5)).toMatchObject({ status: "pending" });
    expect(v("newsletter", "archive", 0.65)).toMatchObject({ status: "pending" });
    expect(v("newsletter", "archive", 0.8)).toMatchObject({ status: "done", action: "archive" });
  });
  it("behalten geht immer", () => {
    expect(v("newsletter", "keep", 0.7)).toMatchObject({ action: "keep", status: "done" });
  });
});

describe("KI-Eingabe", () => {
  it("schickt nur Metadaten und kürzt Vorschau/Betreff", () => {
    const input = JSON.parse(aiInput([mail({ snippet: "x".repeat(1000), subject: "y".repeat(500) })]));
    expect(Object.keys(input[0]).sort()).toEqual(["email", "from", "gmail_tab", "i", "newsletter_header", "preview", "subject"]);
    expect(input[0].preview).toHaveLength(220);
    expect(input[0].subject).toHaveLength(200);
    expect(input[0].gmail_tab).toBe("promotions");
  });
  it("Gmail-Tab Standard ist primary", () => {
    expect(gmailTab(["INBOX"])).toBe("primary");
  });
  it("Schema ist strikt (alle Felder required, keine Zusatzfelder)", () => {
    const item = AI_SCHEMA.properties.results.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });
});
