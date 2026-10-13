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

/** iPhone/iPad (iPadOS meldet sich als Mac, hat aber Touch). */
export function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function pipSupported(): boolean {
  if (typeof document === "undefined") return false;
  // iOS/iPadOS lehnt PiP für Videos mit MediaStream-Quelle ab (WebKit #262479), in Home-Bildschirm-Apps
  // auch sonst (WebKit #303885) – dort gibt es stattdessen den Mini-Timer
  if (isAppleTouch()) return false;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: unknown };
  if (typeof canvas.captureStream !== "function") return false;
  const video = document.createElement("video") as WebkitVideo;
  return Boolean(document.pictureInPictureEnabled || typeof video.webkitSetPresentationMode === "function");
}

export function pipActive(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  return document.pictureInPictureElement === video || (video as WebkitVideo).webkitPresentationMode === "picture-in-picture";
}

/**
 * Stream ans Video hängen und abspielen – vorab im Sekundentakt, damit beim Tipp auf „Bild-in-Bild“
 * schon Bilder da sind (Safari lehnt PiP für ein Video ohne Daten ab). Gemutet + playsInline braucht keine Geste.
 */
export function preparePip(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  if (!video.srcObject) video.srcObject = canvas.captureStream(4);
  if (video.paused) void video.play().catch(() => undefined);
}

/** Stream beenden, wenn kein Timer mehr läuft. */
export function releasePip(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks?.().forEach((track) => track.stop());
  video.srcObject = null;
}

/** Video hat noch keine Daten – nach kurzem Warten nochmal tippen. */
export class PipNotReadyError extends Error {
  override name = "PipNotReadyError";
}

/**
 * Muss direkt aus einem Tipp heraus aufgerufen werden: Safari verlangt den PiP-Aufruf synchron in der
 * Nutzer-Geste – davor darf kein `await` stehen, sonst ist die Geste weg (NotAllowedError).
 */
export function enterPip(canvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<void> {
  preparePip(canvas, video);
  if (video.readyState === 0 /* HAVE_NOTHING */) return Promise.reject(new PipNotReadyError());
  if (typeof video.requestPictureInPicture === "function" && document.pictureInPictureEnabled) {
    return video.requestPictureInPicture().then(() => undefined);
  }
  const v = video as WebkitVideo;
  if (v.webkitSupportsPresentationMode?.("picture-in-picture") === false) {
    return Promise.reject(new DOMException("Bild-in-Bild nicht verfügbar", "NotSupportedError"));
  }
  v.webkitSetPresentationMode?.("picture-in-picture");
  return Promise.resolve();
}

/** Verständliche Meldung für die Fehler von `enterPip`. */
export function pipErrorMessage(err: unknown): string {
  const name = err instanceof Error || err instanceof DOMException ? err.name : "Fehler";
  if (name === "PipNotReadyError") return "Bild-in-Bild lädt noch – tippe gleich nochmal.";
  if (name === "NotAllowedError") return "Der Browser hat Bild-in-Bild blockiert (NotAllowedError). Tippe nochmal direkt auf den Knopf.";
  if (name === "NotSupportedError") return "Bild-in-Bild ist hier nicht verfügbar (NotSupportedError). Nutze den Mini-Timer.";
  return `Bild-in-Bild ging nicht (${name}).`;
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
