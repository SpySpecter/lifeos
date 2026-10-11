/**
 * Untis liefert in der Oberstufe Kursbezeichnungen wie "LK If 1", "GK Pb 2" oder "SK Sk 3".
 * Daraus wird ein lesbarer Fachname plus Kursart (LK/GK/Seminarkurs).
 */
const SUBJECTS: Record<string, string> = {
  ma: "Mathematik",
  de: "Deutsch",
  d: "Deutsch",
  en: "Englisch",
  e: "Englisch",
  fr: "Französisch",
  sn: "Spanisch",
  spa: "Spanisch",
  la: "Latein",
  ru: "Russisch",
  pl: "Polnisch",
  if: "Informatik",
  inf: "Informatik",
  ph: "Physik",
  ch: "Chemie",
  bi: "Biologie",
  bio: "Biologie",
  ge: "Geschichte",
  ek: "Geografie",
  geo: "Geografie",
  pb: "Politische Bildung",
  sp: "Sport",
  ku: "Kunst",
  mu: "Musik",
  ds: "Darstellendes Spiel",
  phil: "Philosophie",
  ler: "LER",
  wat: "WAT",
  re: "Religion",
  ast: "Astronomie",
  sk: "Seminarkurs",
};

export type Course = { title: string; kind: "LK" | "GK" | "Seminarkurs" | null; raw: string };

export function parseCourse(raw: string): Course {
  const parts = raw.trim().split(/\s+/);
  const type = parts[0]?.toUpperCase();
  if ((type === "LK" || type === "GK" || type === "SK") && parts.length >= 2) {
    if (type === "SK") return { title: "Seminarkurs", kind: "Seminarkurs", raw };
    const name = SUBJECTS[parts[1].toLowerCase()];
    return { title: name ?? parts.slice(1).join(" "), kind: type, raw };
  }
  const name = SUBJECTS[raw.trim().toLowerCase()];
  return { title: name ?? raw, kind: null, raw };
}
