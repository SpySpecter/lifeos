"use client";

import { BellOff, BellRing, Send, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { deletePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction, type FormState } from "@/app/actions";
import { Button } from "./ui/button";

type Status = "loading" | "install" | "unsupported" | "denied" | "off" | "on";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || isIos()) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/**
 * Push-Mitteilungen für Habit-Erinnerungen auf diesem Gerät ein- und ausschalten.
 * iPhone: geht nur, wenn LifeOS vom Home-Bildschirm geöffnet wurde (iOS 16.4+), und die Erlaubnis
 * muss direkt aus einem Tipp heraus angefragt werden.
 */
export function PushSettings({ publicKey, devices }: { publicKey: string; devices: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<FormState>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const check = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setStatus(isIos() && !isStandalone() ? "install" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        // Abo still mit dem Server abgleichen (z. B. nach einem Datenbank-Restore)
        await savePushSubscriptionAction(sub.toJSON(), deviceName());
        setStatus("on");
      } else setStatus("off");
    };
    check().catch(() => setStatus("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMessage(null);
      // Muss als Erstes im Tipp passieren – Safari verwirft die Anfrage sonst.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      try {
        const reg = await registration();
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
        const res = await savePushSubscriptionAction(sub.toJSON(), deviceName());
        setMessage(res);
        if (res?.ok) setStatus("on");
      } catch (err) {
        setMessage({ ok: false, message: `Aktivieren fehlgeschlagen: ${(err as Error).message}` });
      }
    });

  const disable = () =>
    start(async () => {
      setMessage(null);
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    });

  const test = () =>
    start(async () => {
      setMessage(await sendTestPushAction());
    });

  return (
    <div className="space-y-3 text-subhead">
      {status === "loading" ? <p className="text-muted-foreground">Prüfe dieses Gerät …</p> : null}

      {status === "install" ? (
        <div className="space-y-2">
          <p>Auf dem iPhone kommen Mitteilungen nur, wenn LifeOS als App auf dem Home-Bildschirm liegt:</p>
          <ol className="space-y-1.5 text-muted-foreground">
            <li className="flex items-center gap-2">
              <Share className="size-4 shrink-0" aria-hidden /> In Safari auf „Teilen“ tippen
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="size-4 shrink-0" aria-hidden /> „Zum Home-Bildschirm“ wählen
            </li>
            <li className="flex items-center gap-2">
              <BellRing className="size-4 shrink-0" aria-hidden /> LifeOS vom Home-Bildschirm öffnen und hier aktivieren
            </li>
          </ol>
        </div>
      ) : null}

      {status === "unsupported" ? <p className="text-muted-foreground">Dieser Browser unterstützt keine Push-Mitteilungen.</p> : null}

      {status === "denied" ? (
        <p className="text-muted-foreground">
          Mitteilungen sind für LifeOS blockiert. Erlauben kannst du sie unter <strong className="font-medium text-foreground">Einstellungen → Mitteilungen → LifeOS</strong>.
        </p>
      ) : null}

      {status === "off" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-48 flex-1 text-muted-foreground">Erinnert dich zur eingestellten Uhrzeit, wenn eine Gewohnheit noch offen ist.</p>
          <Button onClick={enable} disabled={pending}>
            <BellRing aria-hidden /> Mitteilungen aktivieren
          </Button>
        </div>
      ) : null}

      {status === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex min-w-48 flex-1 items-center gap-2">
            <BellRing className="size-4 text-good" aria-hidden />
            Aktiv auf diesem Gerät
            {devices > 1 ? <span className="text-muted-foreground">· {devices} Geräte insgesamt</span> : null}
          </p>
          <Button variant="outline" onClick={test} disabled={pending}>
            <Send aria-hidden /> Test senden
          </Button>
          <Button variant="ghost" onClick={disable} disabled={pending}>
            <BellOff aria-hidden /> Aus
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={message.ok ? "text-muted-foreground" : "text-critical"}>
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
