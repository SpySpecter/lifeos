"use client";

import { BellRing, X } from "lucide-react";
import { useId, useState } from "react";
import { EMOJI_GROUPS, isSingleEmoji, suggestEmoji } from "@/lib/emoji";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export type HabitDraft = { name: string; emoji: string; remindAt: string | null };

/**
 * Emoji, Name und Erinnerungszeit – gemeinsam für „Neu“ und „Bearbeiten“.
 * Solange kein Emoji von Hand gewählt wurde, schlägt der Name eines vor („Wasser trinken“ → 💧).
 */
export function HabitFields({ initial, autoFocus = false }: { initial?: HabitDraft; autoFocus?: boolean }) {
  const ids = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<string | null>(initial?.emoji ?? null);
  const [remindAt, setRemindAt] = useState(initial?.remindAt ?? "");
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const [custom, setCustom] = useState("");

  const emoji = picked ?? suggestEmoji(name) ?? "✅";
  const choose = (e: string) => {
    setPicked(e);
    setOpen(false);
    setCustom("");
  };

  return (
    <>
      <input type="hidden" name="emoji" value={emoji} />
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-emoji`}>Emoji</Label>
        <button
          id={`${ids}-emoji`}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${ids}-picker`}
          aria-label={`Emoji wählen, aktuell ${emoji}`}
          className={cn(
            "grid size-8 place-items-center rounded-lg border border-input text-lg leading-none hover:bg-muted dark:bg-input/30",
            open && "border-ring ring-3 ring-ring/50",
          )}
        >
          {emoji}
        </button>
      </div>
      <div className="min-w-44 flex-1 space-y-1.5">
        <Label htmlFor={`${ids}-name`}>Gewohnheit</Label>
        <Input
          id={`${ids}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. 2 Liter Wasser trinken"
          maxLength={60}
          required
          autoFocus={autoFocus}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-time`}>Erinnerung</Label>
        <div className="flex items-center gap-1">
          <div className="relative">
            <BellRing className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${ids}-time`}
              type="time"
              name="remindAt"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="w-[7.5rem] pl-7 tabular-nums"
            />
          </div>
          {remindAt ? (
            <button
              type="button"
              onClick={() => setRemindAt("")}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Erinnerung entfernen"
              title="Keine Erinnerung"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div
          id={`${ids}-picker`}
          className="w-full min-w-0 basis-full rounded-xl bg-muted/50 p-2 ring-1 ring-foreground/8"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div role="tablist" aria-label="Emoji-Kategorien" className="-mx-2 mb-2 flex min-w-0 gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
            {EMOJI_GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={group === i}
                onClick={() => setGroup(i)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground",
                  group === i && "bg-background text-foreground shadow-sm ring-1 ring-foreground/10",
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="grid min-w-0 grid-cols-5 gap-1 sm:grid-cols-10">
            {EMOJI_GROUPS[group].items.map((o) => (
              <button
                key={o.emoji}
                type="button"
                onClick={() => choose(o.emoji)}
                aria-label={o.label}
                title={o.label}
                aria-pressed={emoji === o.emoji}
                className={cn(
                  "grid h-10 place-items-center rounded-lg text-xl leading-none hover:bg-background",
                  emoji === o.emoji && "bg-background ring-1 ring-foreground/20",
                )}
              >
                {o.emoji}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-foreground/8 pt-2">
            <Label htmlFor={`${ids}-custom`} className="text-xs font-normal text-muted-foreground">
              Eigenes Emoji
            </Label>
            <Input
              id={`${ids}-custom`}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                if (isSingleEmoji(e.target.value)) choose(e.target.value.trim());
              }}
              placeholder="😀"
              maxLength={16}
              inputMode="text"
              className="h-8 w-16 text-center text-lg"
              aria-describedby={`${ids}-custom-hint`}
            />
            <span id={`${ids}-custom-hint`} className="text-xs text-muted-foreground">
              über die Emoji-Tastatur
            </span>
            {picked ? (
              <button type="button" onClick={() => { setPicked(null); setOpen(false); }} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
                Automatisch
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
