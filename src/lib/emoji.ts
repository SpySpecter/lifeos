/** Emoji-Auswahl für Gewohnheiten: kuratierte Gruppen und ein Vorschlag aus dem Namen. */

export type EmojiOption = { emoji: string; label: string };

export const EMOJI_GROUPS: { name: string; items: EmojiOption[] }[] = [
  {
    name: "Gesundheit",
    items: [
      { emoji: "💧", label: "Wasser" },
      { emoji: "🥦", label: "Gemüse" },
      { emoji: "🍎", label: "Obst" },
      { emoji: "💊", label: "Vitamine" },
      { emoji: "😴", label: "Schlaf" },
      { emoji: "🪥", label: "Zähne putzen" },
      { emoji: "🚿", label: "Duschen" },
      { emoji: "🧴", label: "Hautpflege" },
      { emoji: "🚭", label: "Nicht rauchen" },
      { emoji: "☕", label: "Kaffee" },
    ],
  },
  {
    name: "Bewegung",
    items: [
      { emoji: "💪", label: "Krafttraining" },
      { emoji: "🏃", label: "Laufen" },
      { emoji: "🚶", label: "Spazieren" },
      { emoji: "🚴", label: "Radfahren" },
      { emoji: "🏊", label: "Schwimmen" },
      { emoji: "🤸", label: "Dehnen" },
      { emoji: "⚽", label: "Fußball" },
      { emoji: "🏀", label: "Basketball" },
      { emoji: "🧗", label: "Klettern" },
      { emoji: "👟", label: "Schritte" },
    ],
  },
  {
    name: "Lernen & Arbeit",
    items: [
      { emoji: "📚", label: "Lesen" },
      { emoji: "🧠", label: "Lernen" },
      { emoji: "✍️", label: "Schreiben" },
      { emoji: "🗣️", label: "Sprache üben" },
      { emoji: "💻", label: "Programmieren" },
      { emoji: "🎯", label: "Ziel" },
      { emoji: "📝", label: "Hausaufgaben" },
      { emoji: "🎸", label: "Gitarre" },
      { emoji: "🎹", label: "Klavier" },
      { emoji: "🎧", label: "Musik" },
    ],
  },
  {
    name: "Achtsamkeit",
    items: [
      { emoji: "🧘", label: "Meditieren" },
      { emoji: "📓", label: "Tagebuch" },
      { emoji: "🙏", label: "Dankbarkeit" },
      { emoji: "🌬️", label: "Atmen" },
      { emoji: "📵", label: "Handyfrei" },
      { emoji: "🌅", label: "Früh aufstehen" },
      { emoji: "🌙", label: "Abendroutine" },
      { emoji: "🌳", label: "Natur" },
      { emoji: "😊", label: "Stimmung" },
      { emoji: "❤️", label: "Familie & Freunde" },
    ],
  },
  {
    name: "Alltag",
    items: [
      { emoji: "✅", label: "Erledigt" },
      { emoji: "🧹", label: "Aufräumen" },
      { emoji: "🛏️", label: "Bett machen" },
      { emoji: "🍳", label: "Kochen" },
      { emoji: "💰", label: "Sparen" },
      { emoji: "🪴", label: "Pflanzen gießen" },
      { emoji: "🐶", label: "Haustier" },
      { emoji: "📅", label: "Planen" },
      { emoji: "🔥", label: "Serie" },
      { emoji: "⭐", label: "Sonstiges" },
    ],
  },
];

/** Stichwort am Wortanfang → Emoji. Reihenfolge zählt: der erste Treffer gewinnt. */
const KEYWORDS: [string, string][] = [
  ["wasser|trinken", "💧"],
  ["lesen|buch|bücher|seiten", "📚"],
  ["meditier|meditation", "🧘"],
  ["dehnen|stretch|yoga|mobility", "🤸"],
  ["lauf|joggen|jogging|rennen", "🏃"],
  ["spazier|schritte", "🚶"],
  ["rad|fahrrad|bike", "🚴"],
  ["schwimm", "🏊"],
  ["gym|sport|training|trainier|workout|kraft|liegestütz|push.?ups?|klimmz", "💪"],
  ["schlaf|schlafen|ins bett", "😴"],
  ["zähne|zahn", "🪥"],
  ["dusch", "🚿"],
  ["vitamin|tablette|medikament", "💊"],
  ["obst|apfel", "🍎"],
  ["gemüse|gesund essen|salat", "🥦"],
  ["vokabel|sprache|englisch|spanisch|französisch|duolingo", "🗣️"],
  ["lernen|lerne|wiederhol|karteikarten|anki", "🧠"],
  ["hausaufgabe|schule|mappe", "📝"],
  ["code|coden|programmier|github|leetcode", "💻"],
  ["tagebuch|journal", "📓"],
  ["dankbar", "🙏"],
  ["atm", "🌬️"],
  ["handy|bildschirm|social media|screen", "📵"],
  ["früh|aufstehen|wecker", "🌅"],
  ["abend", "🌙"],
  ["aufräum|putzen|zimmer", "🧹"],
  ["bett machen", "🛏️"],
  ["koch", "🍳"],
  ["spar|geld|budget", "💰"],
  ["pflanze|gießen", "🪴"],
  ["gitarre", "🎸"],
  ["klavier|piano", "🎹"],
  ["musik|üben", "🎧"],
  ["schreib", "✍️"],
  ["familie|freunde|anrufen", "❤️"],
  ["rauch", "🚭"],
];

// `\b` kennt keine Umlaute („üben“), daher: kein Buchstabe davor
const MATCHERS = KEYWORDS.map(([words, emoji]) => [new RegExp(`(?<!\\p{L})(${words})`, "iu"), emoji] as const);

export function suggestEmoji(name: string): string | null {
  return MATCHERS.find(([re]) => re.test(name))?.[1] ?? null;
}

/** Erlaubt genau ein Emoji (inkl. Varianten wie ✍️, ❤️ oder Hautfarben/ZWJ-Folgen). */
export function isSingleEmoji(value: string): boolean {
  const segments = [...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(value.trim())];
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segments[0].segment);
}
