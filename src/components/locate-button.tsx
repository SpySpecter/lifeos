"use client";

import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const COOKIE = "lifeos_loc";

function store(lat: number, lon: number) {
  // auf ~1 km gerundet; ein Jahr gültig, nur für diese Seite
  document.cookie = `${COOKIE}=${lat.toFixed(2)},${lon.toFixed(2)}; path=/; max-age=31536000; samesite=lax; secure`;
}

/** Fragt einmalig nach dem Standort (nur wenn noch keiner gespeichert ist) und auf Knopfdruck erneut. */
export function LocateButton({ located }: { located: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) return setError("Standort nicht verfügbar");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        store(pos.coords.latitude, pos.coords.longitude);
        setError(null);
        start(() => router.refresh());
      },
      () => setError("Standort abgelehnt – zeige Standardort"),
      { maximumAge: 30 * 60_000, timeout: 10_000 },
    );
  };

  useEffect(() => {
    if (located || !("permissions" in navigator)) return;
    // nur automatisch abfragen, wenn die Berechtigung schon erteilt wurde – sonst kein Pop-up beim Laden
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => p.state === "granted" && locate())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located]);

  return (
    <button
      type="button"
      onClick={locate}
      disabled={pending}
      title={error ?? "Aktuellen Standort verwenden"}
      aria-label="Aktuellen Standort verwenden"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-subhead text-tint-text hover:bg-muted active:opacity-60"
    >
      <LocateFixed className={pending ? "size-[1.125rem] animate-pulse" : "size-[1.125rem]"} aria-hidden />
      {!located ? <span>Standort</span> : null}
    </button>
  );
}
