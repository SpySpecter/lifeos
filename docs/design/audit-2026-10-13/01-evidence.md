# Evidenz

## Struktur
- Hauptnavigation: 5 Tabs + Zahnrad + „+“ (Heute); keine doppelten Primäraktionen gefunden
- Kopfzeile beim Scrollen: Titel mittig mit `px-24` (96 px) Platz je Seite, Trailing absolut rechts – `src/components/page-header.tsx:50-66`
- Lernen-Trailing = „Fokus“-Pille + Zahnrad ≈ 150 px breit → größer als die 96 px Reserve

## Visuell (gemessen im Browser)
- Eine Farbfamilie (Apple-Systemfarben als Tokens), Kontrast per Test ≥ 4,5:1 (`tests/contrast.test.ts`)
- Zustände: leer ✅ („Keine ungelesenen Mails. ✨“, `inbox-widget.tsx`), laden ✅ (Skeletons pro Widget), Fehler ✅ (`ResultView`, „stale“-Hinweis), Erfolg ✅ (Status-Texte in Formularen), deaktiviert ✅ („Nichts fällig“), Fokus ✅ (keine Buttons ohne Namen, keine Ziele < 32 px auf Heute)
- **Überlappung:** eingeklappte Leiste auf `/lernen` – „Lernen“ stößt an „⏱ Fokus“ (Zoom 0–80 px, dunkel)
- **Abgeschnitten:** Habit-Namen einzeilig mit `truncate` – „Kein Handy nach 22 U…“ obwohl die Zeile Platz für zwei Zeilen hat (`src/components/habit-list.tsx:74`)

## Text & Ehrlichkeit
- Ehrlich: KI-Kosten werden angezeigt, Gmail-App-Hinweis sagt offen, dass nur der Posteingang öffnet, „Graue Spur …“ erklärt die Balken
- **Unklar:** „Englisch entfällt heute · +1“ – „+1“ ohne Bezug (`src/lib/hero.ts:51`)
- **Unklar:** „20 / 0 Min.“ bei ungeplanter Lernzeit; Schrägstrich-Notation braucht die Legende im Footer (`src/components/study-bars.tsx:12`, `src/app/lernen/page.tsx:54`)
- „Jetzt · bis 11:05“ – knapp, aber mit Fach darunter verständlich

## Gewicht & Reibung
- Dev-Build: 21 JS-Dateien, 5,2 MB unkomprimiert (Dev, unminifiziert – nicht aussagekräftig); 24 Requests; domInteractive 773 ms (Dev)
- Laufende Animationen im Ruhezustand: 0 (Skeletons enden nach dem Streamen); `prefers-reduced-motion` im CSS vorhanden
- Dark Mode folgt dem System; keine Modals/Badges beim Laden

## Barrierefreiheit
- 10 Landmarks, alle Bilder mit alt, keine namenlosen Buttons/Links, kein Skip-Link (bei Tab-Leiste unten vertretbar)
