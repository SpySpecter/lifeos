import { describe, expect, it } from "vitest";
import { capsuleOffset, tabAt } from "@/lib/tab-bar";

describe("tabAt", () => {
  // Leiste von x=10 bis x=360, fünf Tabs à 70 px
  it("findet den Tab unter dem Finger", () => {
    expect(tabAt(10, 10, 350, 5)).toBe(0);
    expect(tabAt(79.9, 10, 350, 5)).toBe(0);
    expect(tabAt(80, 10, 350, 5)).toBe(1);
    expect(tabAt(185, 10, 350, 5)).toBe(2);
    expect(tabAt(359, 10, 350, 5)).toBe(4);
  });

  it("klemmt außerhalb der Leiste auf den Rand-Tab", () => {
    expect(tabAt(-50, 10, 350, 5)).toBe(0);
    expect(tabAt(360, 10, 350, 5)).toBe(4);
    expect(tabAt(1000, 10, 350, 5)).toBe(4);
  });

  it("übersteht leere Leisten", () => {
    expect(tabAt(100, 0, 0, 5)).toBe(0);
    expect(tabAt(100, 0, 350, 0)).toBe(0);
  });
});

describe("capsuleOffset", () => {
  it("zentriert die Kapsel unter dem Finger", () => {
    expect(capsuleOffset(185, 10, 350, 5)).toBe(140);
  });

  it("bleibt innerhalb der Leiste", () => {
    expect(capsuleOffset(0, 10, 350, 5)).toBe(0);
    expect(capsuleOffset(500, 10, 350, 5)).toBe(280);
  });
});
