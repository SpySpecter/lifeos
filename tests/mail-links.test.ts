import { describe, expect, it } from "vitest";
import { appleMailUrl, mailAppUrl } from "@/lib/mail/links";

describe("mail links", () => {
  it("baut message:-URLs aus dem Message-ID-Header", () => {
    expect(appleMailUrl("<CAF+abc=1@mail.gmail.com>")).toBe("message:%3CCAF%2Babc%3D1%40mail.gmail.com%3E");
    expect(appleMailUrl("  abc@host.de ")).toBe("message:%3Cabc%40host.de%3E");
    expect(appleMailUrl("")).toBeNull();
    expect(appleMailUrl("<kaputt mit leerzeichen>")).toBeNull();
  });

  it("wählt je nach Einstellung App oder Browser", () => {
    expect(mailAppUrl("mail", "<a@b>")).toBe("message:%3Ca%40b%3E");
    expect(mailAppUrl("mail", null)).toBeNull();
    expect(mailAppUrl("gmail", null)).toBe("googlegmail://");
    expect(mailAppUrl("web", "<a@b>")).toBeNull();
  });
});
