"use client";

import { useSyncExternalStore } from "react";
import type { FocusTimer } from "./timer";

/**
 * Globaler Zustand des Fokus-Timers: läuft über Seitenwechsel hinweg (das Dock hängt im Layout) und
 * überlebt Neuladen über localStorage. Andere Komponenten öffnen das Sheet mit `openFocus()`.
 */

export type FocusPreset = { subject: string; studySessionId: number | null; minutes?: number };
type State = { timer: FocusTimer | null; sheetOpen: boolean; preset: FocusPreset | null };

const KEY = "lifeos-focus";
let state: State = { timer: null, sheetOpen: false, preset: null };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...state, timer: JSON.parse(raw) as FocusTimer };
  } catch {
    // privater Modus o. Ä.: ohne Speicher weiter
  }
}

function persist() {
  try {
    if (state.timer) window.localStorage.setItem(KEY, JSON.stringify(state.timer));
    else window.localStorage.removeItem(KEY);
  } catch {
    // egal – läuft dann nur bis zum Neuladen
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if ("timer" in next) persist();
  for (const l of listeners) l();
}

export const focusStore = {
  get: () => {
    load();
    return state;
  },
  setTimer: (timer: FocusTimer | null) => set({ timer }),
  update: (fn: (t: FocusTimer) => FocusTimer) => {
    if (state.timer) set({ timer: fn(state.timer) });
  },
  setSheet: (sheetOpen: boolean) => set({ sheetOpen, ...(sheetOpen ? {} : { preset: null }) }),
};

/** Sheet öffnen – optional mit vorausgefülltem Fach und Lerneinheit. */
export function openFocus(preset?: FocusPreset) {
  set({ sheetOpen: true, preset: preset ?? null });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: State = { timer: null, sheetOpen: false, preset: null };

export function useFocus(): State {
  return useSyncExternalStore(subscribe, focusStore.get, () => SERVER);
}
