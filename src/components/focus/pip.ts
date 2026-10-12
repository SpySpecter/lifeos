"use client";

/**
 * Bild-in-Bild: Der Timer wird jede Sekunde auf ein Canvas gemalt, dessen Videostream in einem
 * <video> läuft. Dieses Video kann iPadOS als schwebendes Fenster über andere Apps legen.
 */

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

export const PIP_W = 480;
export const PIP_H = 270;

export function pipSupported(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: unknown };
  if (typeof canvas.captureStream !== "function") return false;
  const video = document.createElement("video") as WebkitVideo;
  return Boolean(document.pictureInPictureEnabled || typeof video.webkitSetPresentationMode === "function");
}

export function pipActive(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  return document.pictureInPictureElement === video || (video as WebkitVideo).webkitPresentationMode === "picture-in-picture";
}

/** Muss direkt aus einem Tipp heraus aufgerufen werden (Nutzer-Geste). */
export async function enterPip(canvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<void> {
  if (!video.srcObject) video.srcObject = canvas.captureStream(4);
  await video.play().catch(() => undefined);
  const v = video as WebkitVideo;
  if (typeof video.requestPictureInPicture === "function" && document.pictureInPictureEnabled) await video.requestPictureInPicture();
  else v.webkitSetPresentationMode?.("picture-in-picture");
}

export async function exitPip(video: HTMLVideoElement): Promise<void> {
  if (document.pictureInPictureElement) await document.exitPictureInPicture();
  else (video as WebkitVideo).webkitSetPresentationMode?.("inline");
}

/** Ein Bild des Timers: Fach oben, große Zeit, Phase unten, Fortschrittsbalken. */
export function drawFrame(
  canvas: HTMLCanvasElement,
  f: { time: string; subject: string; label: string; progress: number | null; tone: "work" | "break" | "idle" },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const accent = f.tone === "work" ? "#0a84ff" : f.tone === "break" ? "#30d158" : "#98989f";
  ctx.fillStyle = "#1c1c1e";
  ctx.fillRect(0, 0, PIP_W, PIP_H);
  ctx.fillStyle = "#98989f";
  ctx.font = "600 26px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(f.subject.length > 28 ? `${f.subject.slice(0, 27)}…` : f.subject, PIP_W / 2, 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 112px -apple-system, system-ui, sans-serif";
  ctx.fillText(f.time, PIP_W / 2, 170);
  ctx.fillStyle = accent;
  ctx.font = "600 26px -apple-system, system-ui, sans-serif";
  ctx.fillText(f.label, PIP_W / 2, 215);
  if (f.progress !== null) {
    ctx.fillStyle = "rgba(118,118,128,0.35)";
    ctx.fillRect(40, 240, PIP_W - 80, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(40, 240, (PIP_W - 80) * Math.min(1, Math.max(0, f.progress)), 8);
  }
}
