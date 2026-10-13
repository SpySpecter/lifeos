"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { setMailAppAction } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { MAIL_APP_LABEL, MAIL_APPS, mailAppUrl, type MailApp } from "@/lib/mail/links";
import { Segmented } from "./ios/segmented";

type Platform = "ios" | "mac" | "other";

function detect(): Platform {
  const ua = navigator.userAgent;
  // iPadOS meldet sich als „Macintosh“, hat aber einen Touchscreen
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /Macintosh/.test(ua) ? "mac" : "other";
}

const noop = () => () => {};
/** Beim Vorrendern unbekannt (null) → zuerst immer der Browser-Link, auf dem Gerät dann ggf. die App. */
const usePlatform = () => useSyncExternalStore<Platform | null>(noop, detect, () => null);

/** Link auf eine Mail: auf iPhone/iPad in Apple Mail bzw. der Gmail-App, sonst Gmail im Browser. */
export function MailLink({
  webUrl,
  messageId,
  app,
  className,
  children,
}: {
  webUrl: string;
  messageId?: string | null;
  app: MailApp;
  className?: string;
  children: React.ReactNode;
}) {
  const platform = usePlatform();
  // Apple Mail gibt es auch am Mac, die Gmail-App nur auf iPhone/iPad
  const native = platform === "ios" || (platform === "mac" && app === "mail") ? mailAppUrl(app, messageId) : null;
  if (native) {
    return (
      <a href={native} className={className}>
        {children}
      </a>
    );
  }
  if (!webUrl || webUrl === "#") return <span className={className}>{children}</span>;
  return (
    <a href={webUrl} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

export function MailAppPicker({ value }: { value: MailApp }) {
  const [current, setCurrent] = useState(value);
  const [, start] = useTransition();
  return (
    <Segmented
      label="Mails öffnen in"
      value={current}
      options={MAIL_APPS.map((a) => ({ value: a, label: MAIL_APP_LABEL[a] }))}
      onChange={(v) => {
        haptic();
        setCurrent(v);
        start(() => setMailAppAction(v));
      }}
      className="w-full max-w-sm"
    />
  );
}
