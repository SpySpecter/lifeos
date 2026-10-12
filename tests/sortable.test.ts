import { describe, expect, it } from "vitest";
import { dropIndex, moveItem } from "@/components/ios/sortable-list";

describe("Sortierbare Liste", () => {
  const tops = [0, 50, 100, 150];
  const heights = [50, 50, 50, 50];

  it("bleibt an Ort und Stelle ohne Bewegung", () => {
    expect(dropIndex(tops, heights, 1, 0)).toBe(1);
  });

  it("wechselt erst über die Mitte der Nachbarzeile", () => {
    expect(dropIndex(tops, heights, 0, 20)).toBe(0);
    expect(dropIndex(tops, heights, 0, 55)).toBe(1);
    expect(dropIndex(tops, heights, 0, 160)).toBe(3);
    expect(dropIndex(tops, heights, 3, -110)).toBe(1);
  });

  it("verschiebt Elemente", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });
});
