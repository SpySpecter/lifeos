"use client";

import { Moon, Sun } from "lucide-react";

/** Wechselt zwischen hell und dunkel; die Wahl liegt in localStorage (Standard: Systemeinstellung). */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("lifeos-theme", dark ? "dark" : "light");
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Hell/Dunkel umschalten"
      title="Hell/Dunkel umschalten"
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
    </button>
  );
}

/** Läuft vor dem ersten Paint, damit es kein Aufblitzen im falschen Theme gibt. */
export const themeScript = `(()=>{try{var t=localStorage.getItem("lifeos-theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
