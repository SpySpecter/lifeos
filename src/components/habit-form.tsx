"use client";

import { useActionState, useEffect, useRef } from "react";
import { addHabitAction, type FormState } from "@/app/actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function HabitForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addHabitAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="emoji">Emoji</Label>
        <Input id="emoji" name="emoji" placeholder="✅" maxLength={8} className="w-16 text-center" />
      </div>
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="name">Neue Gewohnheit</Label>
        <Input id="name" name="name" placeholder="z. B. 10 Minuten meditieren" maxLength={60} required />
      </div>
      <Button type="submit" disabled={pending}>
        Hinzufügen
      </Button>
      {state ? (
        <p role="status" className={state.ok ? "w-full text-sm text-muted-foreground" : "w-full text-sm text-critical"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
