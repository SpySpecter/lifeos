"use client";

import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import {
  createEventAction,
  createReminderAction,
  parseQuickEntryAction,
  quickAddDataAction,
  type FormState,
  type QuickAddData,
} from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Segmented } from "./ios/segmented";
import { Sheet } from "./ios/sheet";
import { Button } from "./ui/button";

type Kind = "erinnerung" | "termin";
type Draft = {
  title: string;
  note: string;
  date: string;
  time: string;
  endTime: string;
  allDay: boolean;
  location: string;
  remindBefore: number;
};

const REMIND_OPTIONS = [
  { value: 0, label: "Keine" },
  { value: 10, label: "10 Minuten vorher" },
  { value: 30, label: "30 Minuten vorher" },
  { value: 60, label: "1 Stunde vorher" },
  { value: 1440, label: "1 Tag vorher" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Neuer Entwurf: heute, zur nächsten vollen Stunde (nach 23 Uhr: morgen 9 Uhr). */
function freshDraft(): Draft {
  const d = new Date();
  let hour = d.getHours() + 1;
  if (hour > 23) {
    d.setDate(d.getDate() + 1);
    hour = 9;
  }
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { title: "", note: "", date, time: `${pad(hour)}:00`, endTime: "", allDay: false, location: "", remindBefore: 0 };
}

/** „+“ auf Heute: neue Erinnerung oder neuer Kalendertermin, optional per KI aus einem Satz vorausgefüllt. */
export function QuickAddButton() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <button
        type="button"
        aria-label="Erinnerung oder Termin hinzufügen"
        onClick={() => {
          setSession((s) => s + 1);
          setOpen(true);
        }}
        className="grid size-11 place-items-center rounded-full text-tint hover:bg-muted active:bg-muted"
      >
        <Plus className="size-[1.625rem]" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Neu">
        <QuickAdd key={session} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function QuickAdd({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<Kind>("erinnerung");
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [data, setData] = useState<QuickAddData | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    let alive = true;
    quickAddDataAction()
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ calendars: [], lastCalendar: null, ai: false }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {data?.ai ? (
        <AiField
          onEntry={(e) => {
            setKind(e.kind);
            setDraft((d) => ({
              ...d,
              title: e.title,
              date: e.date,
              time: e.time ?? d.time,
              endTime: e.endTime ?? "",
              allDay: e.allDay,
              location: e.location ?? "",
              remindBefore: e.remindBefore,
            }));
          }}
        />
      ) : null}
      <Segmented
        label="Art"
        value={kind}
        onChange={setKind}
        options={[
          { value: "erinnerung", label: "Erinnerung" },
          { value: "termin", label: "Termin" },
        ]}
      />
      {kind === "erinnerung" ? (
        <ReminderForm draft={draft} set={set} onDone={onDone} />
      ) : (
        <EventForm draft={draft} set={set} data={data} onDone={onDone} />
      )}
    </div>
  );
}

function AiField({ onEntry }: { onEntry: (e: Extract<Awaited<ReturnType<typeof parseQuickEntryAction>>, { ok: true }>["entry"]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await parseQuickEntryAction(text);
      if (res?.ok) {
        haptic();
        onEntry(res.entry);
      } else if (res) setError(res.message);
    });
  return (
    <div className="rounded-[12px] bg-card p-3">
      <label htmlFor={id} className="flex items-center gap-1.5 text-footnote font-semibold text-muted-foreground">
        <Sparkles className="size-3.5 text-tint" aria-hidden />
        Schnelleingabe
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) submit();
            }
          }}
          maxLength={300}
          enterKeyHint="go"
          placeholder="z. B. „Freitag 15 Uhr Zahnarzt, 1 Std. vorher erinnern“"
          className="min-h-11 min-w-0 flex-1 rounded-[10px] bg-muted px-3 text-body outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="button" variant="outline" disabled={pending || !text.trim()} onClick={submit}>
          {pending ? "…" : "Ausfüllen"}
        </Button>
      </div>
      <p className={cn("mt-1.5 text-footnote", error ? "text-critical" : "text-muted-foreground")} role="status">
        {error ?? "Füllt das Formular aus – gespeichert wird erst mit „Hinzufügen“."}
      </p>
    </div>
  );
}

/** Eine Gruppe wie in den iOS-Einstellungen: weiße Karte, Zeilen mit Trennlinie. */
function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-[12px] bg-card">{children}</div>;
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-4">
      <label htmlFor={htmlFor} className="shrink-0 text-body">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

const fieldClass = "min-h-11 w-full min-w-0 bg-transparent text-body outline-none placeholder:text-muted-foreground";
const pickerClass = "min-h-8 rounded-[8px] bg-muted px-2 text-body tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Status({ state }: { state: FormState }) {
  return state && !state.ok ? (
    <p role="alert" className="text-footnote text-critical">
      {state.message}
    </p>
  ) : null;
}

type FormProps = { draft: Draft; set: (patch: Partial<Draft>) => void; onDone: () => void };

function useSubmit(action: (prev: FormState, formData: FormData) => Promise<FormState>, onDone: () => void) {
  return useActionState(async (prev: FormState, formData: FormData) => {
    const res = await action(prev, formData);
    if (res?.ok) {
      haptic();
      onDone();
    }
    return res;
  }, null);
}

function ReminderForm({ draft, set, onDone }: FormProps) {
  const [state, action, pending] = useSubmit(createReminderAction, onDone);
  const id = useId();
  return (
    <form action={action} className="space-y-4">
      <Group>
        <input
          name="title"
          aria-label="Titel"
          required
          maxLength={120}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Woran soll ich dich erinnern?"
          className={cn(fieldClass, "px-4")}
        />
        <input
          name="note"
          aria-label="Notiz"
          maxLength={300}
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Notiz (optional)"
          className={cn(fieldClass, "px-4")}
        />
      </Group>
      <Group>
        <Row label="Datum" htmlFor={`${id}-date`}>
          <input id={`${id}-date`} name="date" type="date" required value={draft.date} onChange={(e) => set({ date: e.target.value })} className={pickerClass} />
        </Row>
        <Row label="Uhrzeit" htmlFor={`${id}-time`}>
          <input id={`${id}-time`} name="time" type="time" required value={draft.time} onChange={(e) => set({ time: e.target.value })} className={pickerClass} />
        </Row>
      </Group>
      <p className="px-4 text-footnote text-muted-foreground">Kommt als Mitteilung auf alle Geräte, auf denen Mitteilungen aktiviert sind.</p>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending || !draft.title.trim()}>
        {pending ? "Speichert …" : "Hinzufügen"}
      </Button>
    </form>
  );
}

function EventForm({ draft, set, data, onDone }: FormProps & { data: QuickAddData | null }) {
  const [state, action, pending] = useSubmit(createEventAction, onDone);
  const id = useId();
  const calendars = data?.calendars ?? [];
  const value = (c: QuickAddData["calendars"][number]) => `${c.account}|${c.id}`;
  const preferred = calendars.find((c) => value(c) === data?.lastCalendar) ?? calendars.find((c) => c.primary) ?? calendars[0];
  const [calendar, setCalendar] = useState<string | null>(null);
  const selected = calendar ?? (preferred ? value(preferred) : "");
  const color = calendars.find((c) => value(c) === selected)?.color;
  const multipleAccounts = new Set(calendars.map((c) => c.account)).size > 1;

  if (data && !calendars.length) {
    return (
      <div className="rounded-[12px] bg-card p-4 text-body">
        <p>Um Termine anzulegen, braucht LifeOS Schreibrechte für deinen Google Kalender.</p>
        <Link href="/settings#google" onClick={onDone} className="mt-2 inline-block font-medium text-tint-text">
          In den Einstellungen neu verbinden
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Group>
        <input
          name="title"
          aria-label="Titel"
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Titel"
          className={cn(fieldClass, "px-4")}
        />
        <input
          name="location"
          aria-label="Ort"
          maxLength={200}
          value={draft.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Ort (optional)"
          className={cn(fieldClass, "px-4")}
        />
      </Group>
      <Group>
        <Row label="Ganztägig" htmlFor={`${id}-allday`}>
          <input
            id={`${id}-allday`}
            name="allDay"
            type="checkbox"
            // iOS 18+: echter Schalter mit Haptik
            {...{ switch: "" }}
            checked={draft.allDay}
            onChange={(e) => set({ allDay: e.target.checked })}
            className="size-6 accent-[var(--status-good)]"
          />
        </Row>
        <Row label="Datum" htmlFor={`${id}-date`}>
          <input id={`${id}-date`} name="date" type="date" required value={draft.date} onChange={(e) => set({ date: e.target.value })} className={pickerClass} />
        </Row>
        {draft.allDay ? null : (
          <>
            <Row label="Beginn" htmlFor={`${id}-start`}>
              <input id={`${id}-start`} name="start" type="time" required value={draft.time} onChange={(e) => set({ time: e.target.value })} className={pickerClass} />
            </Row>
            <Row label="Ende" htmlFor={`${id}-end`}>
              <input
                id={`${id}-end`}
                name="end"
                type="time"
                value={draft.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                className={cn(pickerClass, !draft.endTime && "text-muted-foreground")}
              />
            </Row>
          </>
        )}
      </Group>
      <Group>
        <Row label="Kalender" htmlFor={`${id}-cal`}>
          <span className="mr-2 size-2.5 shrink-0 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} aria-hidden />
          <select
            id={`${id}-cal`}
            name="calendar"
            required
            disabled={!data}
            value={selected}
            onChange={(e) => setCalendar(e.target.value)}
            className="min-h-11 max-w-[60%] truncate bg-transparent text-right text-body text-muted-foreground outline-none"
          >
            {!data ? <option value="">Lädt …</option> : null}
            {multipleAccounts
              ? [...new Set(calendars.map((c) => c.account))].map((account) => (
                  <optgroup key={account} label={account}>
                    {calendars
                      .filter((c) => c.account === account)
                      .map((c) => (
                        <option key={value(c)} value={value(c)}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))
              : calendars.map((c) => (
                  <option key={value(c)} value={value(c)}>
                    {c.name}
                  </option>
                ))}
          </select>
        </Row>
        <Row label="Erinnerung" htmlFor={`${id}-remind`}>
          <select
            id={`${id}-remind`}
            name="remindBefore"
            value={draft.remindBefore}
            onChange={(e) => set({ remindBefore: Number(e.target.value) })}
            className="min-h-11 bg-transparent text-right text-body text-muted-foreground outline-none"
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group>
        <textarea
          name="note"
          aria-label="Notiz"
          maxLength={1000}
          rows={2}
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Notiz (optional)"
          className={cn(fieldClass, "resize-none px-4 py-2.5")}
        />
      </Group>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending || !data || !draft.title.trim()}>
        {pending ? "Legt an …" : "Hinzufügen"}
      </Button>
    </form>
  );
}
