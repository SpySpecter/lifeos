"use client";

import { useTransition } from "react";
import { disconnectAction } from "@/app/actions";
import { Button } from "./ui/button";

export function DisconnectButton({ provider, label = "Trennen" }: { provider: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Verbindung trennen? Gespeicherte Tokens werden gelöscht.")) start(() => disconnectAction(provider));
      }}
    >
      {label}
    </Button>
  );
}
