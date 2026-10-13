import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enterPip, pipErrorMessage } from "@/components/focus/pip";

function fakes(opts: { readyState: number; standard: boolean }) {
  const stream = { getTracks: () => [] };
  const canvas = { captureStream: vi.fn(() => stream) } as unknown as HTMLCanvasElement;
  const video = {
    srcObject: null as unknown,
    paused: true,
    readyState: opts.readyState,
    play: vi.fn(() => Promise.resolve()),
    requestPictureInPicture: opts.standard ? vi.fn(() => Promise.resolve({})) : undefined,
    webkitSupportsPresentationMode: vi.fn(() => true),
    webkitSetPresentationMode: vi.fn(),
  };
  vi.stubGlobal("document", { pictureInPictureEnabled: opts.standard });
  return { canvas, video, videoEl: video as unknown as HTMLVideoElement };
}

describe("Bild-in-Bild", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("fordert PiP synchron an – ohne await davor geht die Nutzer-Geste in Safari verloren", () => {
    const { canvas, video, videoEl } = fakes({ readyState: 4, standard: true });
    void enterPip(canvas, videoEl);
    // noch kein Microtask gelaufen
    expect(video.requestPictureInPicture).toHaveBeenCalledOnce();
    expect(video.srcObject).not.toBeNull();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("nutzt webkitSetPresentationMode, wenn die Standard-API fehlt", () => {
    const { canvas, video, videoEl } = fakes({ readyState: 4, standard: false });
    void enterPip(canvas, videoEl);
    expect(video.webkitSetPresentationMode).toHaveBeenCalledWith("picture-in-picture");
  });

  it("Video ohne Daten: startet den Stream, fordert PiP aber nicht an", async () => {
    const { canvas, video, videoEl } = fakes({ readyState: 0, standard: true });
    await expect(enterPip(canvas, videoEl)).rejects.toThrow();
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
    expect(canvas.captureStream).toHaveBeenCalledOnce();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("übersetzt Fehler in eine Meldung mit Fehlername", async () => {
    const { canvas, videoEl } = fakes({ readyState: 0, standard: true });
    const err = await enterPip(canvas, videoEl).catch((e: unknown) => e);
    expect(pipErrorMessage(err)).toContain("nochmal");
    expect(pipErrorMessage(new DOMException("x", "NotAllowedError"))).toContain("NotAllowedError");
    expect(pipErrorMessage(new DOMException("x", "AbortError"))).toContain("AbortError");
  });
});
