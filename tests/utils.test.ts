import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("behält iOS-Textgröße neben einer Textfarbe", () => {
    expect(cn("text-title1 font-bold", "text-critical")).toBe("text-title1 font-bold text-critical");
  });
  it("ersetzt Textgrößen untereinander", () => {
    expect(cn("text-sm", "text-footnote")).toBe("text-footnote");
    expect(cn("text-footnote", "text-body")).toBe("text-body");
  });
});
