"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import {
  addMailRuleAction,
  deleteMailRuleAction,
  saveMailProfileAction,
  saveProfileAction,
  type FormState,
} from "@/app/actions";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/mail/policy";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={cn("text-sm", state.ok ? "text-muted-foreground" : "text-critical")}>
      {state.message}
    </p>
  );
}

const Field = ({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} name={id} {...props} />
  </div>
);

export function ProfileForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, null);
  const p = settings.defaultPlace;
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <Field id="displayName" label="Name für die Begrüßung" defaultValue={settings.displayName} maxLength={40} />
        </div>
        <div className="col-span-2">
          <Field id="placeName" label="Standard-Ort (Wetter)" defaultValue={p?.name ?? ""} placeholder="z. B. Wandlitz" />
        </div>
        <Field id="lat" label="Breitengrad" defaultValue={p?.lat ?? ""} inputMode="decimal" placeholder="52.72" />
        <Field id="lon" label="Längengrad" defaultValue={p?.lon ?? ""} inputMode="decimal" placeholder="13.44" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tagesziele</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field id="steps" label="Schritte" defaultValue={settings.goals.steps} inputMode="numeric" />
          <Field id="sleep" label="Schlaf (h)" defaultValue={settings.goals.sleep} inputMode="decimal" />
          <Field id="workout" label="Training (min)" defaultValue={settings.goals.workout} inputMode="numeric" />
          <Field id="energy" label="Aktivkalorien" defaultValue={settings.goals.energy} inputMode="numeric" />
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Speichern
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function MailProfileForm({ profile }: { profile: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMailProfileAction, null);
  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="mailProfile">Über mich &amp; meine Mail-Vorlieben (bekommt die KI bei jeder Sortierung)</Label>
      <textarea
        id="mailProfile"
        name="mailProfile"
        defaultValue={profile}
        rows={7}
        maxLength={4000}
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Speichern
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

const ACTIONS = { keep: "Behalten", archive: "Archivieren", trash: "Löschen" } as const;

export function RuleForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addMailRuleAction, null);
  const select = "h-8 rounded-lg border bg-transparent px-2 text-sm";
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="pattern">Absender oder Domain</Label>
        <Input id="pattern" name="pattern" placeholder="newsletter@shop.de oder shop.de" required />
      </div>
      <select name="action" aria-label="Aktion" className={select} defaultValue="trash">
        {Object.entries(ACTIONS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select name="category" aria-label="Kategorie" className={select} defaultValue="">
        <option value="">Kategorie (optional)</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        Regel hinzufügen
      </Button>
      <div className="w-full">
        <Status state={state} />
      </div>
    </form>
  );
}

export function RuleList({
  rules,
}: {
  rules: { id: number; pattern: string; action: keyof typeof ACTIONS; category: keyof typeof CATEGORY_LABEL | null; source: string }[];
}) {
  const [pending, start] = useTransition();
  if (!rules.length) return <p className="text-sm text-muted-foreground">Noch keine Regeln. Sie entstehen auch automatisch, wenn du im Mail-Assistenten entscheidest oder etwas rückgängig machst.</p>;
  return (
    <ul className={cn("divide-y text-sm", pending && "opacity-60")}>
      {rules.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.pattern}</span>
          <span className="shrink-0 text-xs">{ACTIONS[r.action]}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {r.category ? CATEGORY_LABEL[r.category] : ""} · {r.source}
          </span>
          <button
            type="button"
            onClick={() => start(() => deleteMailRuleAction(r.id))}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Regel ${r.pattern} löschen`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
