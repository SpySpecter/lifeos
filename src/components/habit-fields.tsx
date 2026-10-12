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
            "grid size-11 place-items-center rounded-[10px] bg-muted text-title3 leading-none active:opacity-70",
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
            <BellRing className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${ids}-time`}
              type="time"
              name="remindAt"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="w-[8.5rem] pl-8 tabular-nums"
            />
          </div>
          {remindAt ? (
            <button
              type="button"
              onClick={() => setRemindAt("")}
              className="grid size-11 place-items-center rounded-full text-muted-foreground active:bg-muted"
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
          className="w-full min-w-0 basis-full rounded-[14px] bg-muted p-2"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div role="tablist" aria-label="Emoji-Kategorien" className="no-scrollbar -mx-2 mb-2 flex min-w-0 gap-1 overflow-x-auto px-2">
            {EMOJI_GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={group === i}
                onClick={() => setGroup(i)}
                className={cn(
                  "min-h-9 rounded-full px-3 text-footnote font-medium whitespace-nowrap",
                  group === i && "bg-card shadow-sm",
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
                  "grid h-11 place-items-center rounded-[10px] text-title2 leading-none active:bg-card",
                  emoji === o.emoji && "bg-card ring-2 ring-tint",
                )}
              >
                {o.emoji}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-foreground/8 pt-2">
            <Label htmlFor={`${ids}-custom`} className="text-footnote font-normal text-muted-foreground">
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
              className="w-16 bg-card text-center text-title3"
              aria-describedby={`${ids}-custom-hint`}
            />
            <span id={`${ids}-custom-hint`} className="text-footnote text-muted-foreground">
              über die Emoji-Tastatur
            </span>
            {picked ? (
              <button type="button" onClick={() => { setPicked(null); setOpen(false); }} className="ml-auto min-h-11 px-1 text-footnote text-tint-text">
                Automatisch
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
