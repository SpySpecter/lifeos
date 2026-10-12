"use client";

import { useActionState } from "react";
import { saveHealthAction, type FormState } from "@/app/actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const FIELDS = [
  { name: "steps", label: "Schritte", step: "1", placeholder: "8000" },
  { name: "sleep", label: "Schlaf (h)", step: "0.1", placeholder: "7,5" },
  { name: "workout", label: "Training (min)", step: "1", placeholder: "45" },
  { name: "energy", label: "Aktivkalorien", step: "1", placeholder: "450" },
  { name: "heart", label: "Ruhepuls", step: "1", placeholder: "58" },
  { name: "mood", label: "Stimmung (1–5)", step: "1", placeholder: "4" },
];

export function HealthForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHealthAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 space-y-1.5 sm:col-span-3">
          <Label htmlFor="day">Tag</Label>
          <Input id="day" name="day" type="date" defaultValue={today} max={today} required className="w-44" />
        </div>
        {FIELDS.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name}>{f.label}</Label>
            <Input id={f.name} name={f.name} inputMode="decimal" placeholder={f.placeholder} autoComplete="off" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
        {state ? (
          <p role="status" className={state.ok ? "text-subhead text-muted-foreground" : "text-subhead text-critical"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
