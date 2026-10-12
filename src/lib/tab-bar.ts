/** Reine Geometrie der Tab-Leiste – getrennt vom Bauteil, damit sie testbar ist. */

/** Bewegung in px, ab der ein Daumen auf der Leiste als Ziehen gilt (darunter bleibt es ein Tipp). */
export const DRAG_THRESHOLD = 6;

/** Index des Tabs unter `x`; außerhalb der Leiste der nächstgelegene Rand-Tab. */
export function tabAt(x: number, left: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  const i = Math.floor(((x - left) / width) * count);
  return Math.min(count - 1, Math.max(0, i));
}

/** Linke Kante der Kapsel in px (relativ zu `left`), mittig unter dem Finger und innerhalb der Leiste. */
export function capsuleOffset(x: number, left: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  const tab = width / count;
  return Math.min(width - tab, Math.max(0, x - left - tab / 2));
}
