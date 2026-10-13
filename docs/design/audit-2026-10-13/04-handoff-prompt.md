```
/make-plan Refine LifeOS (iPhone/iPad-Dashboard) based on a Dieter Rams audit (total 21/30).

Verdict paragraph:
> Mit 21/30 und keinem Prinzip auf 0 hat LifeOS ein tragfähiges, konsequentes System – nachzuschärfen ist vor allem die Verständlichkeit einzelner Kurzformen und zwei raue Details.

Keep (already strong, do NOT touch in this pass):
- Principle #2 (useful) scored 3 — Evidence: Heute-Kacheln beantworten die Hauptfragen in der ersten Bildschirmhöhe. Regression check: Screenshot / bei 375 px, vier Kacheln sichtbar ohne Scrollen.
- Principle #6 (honest) scored 3 — Evidence: KI-Kosten sichtbar, Gmail-App-Hinweis ehrlich. Regression check: grep nach neuen Superlativen in src/**/*.tsx.

Fix in priority order:
1. #4 Verständlich – Ausfälle: „· +1“ → „· 1 weitere“ ausschreiben. Evidence: src/lib/hero.ts:51.
2. #4/#10 Verständlich – Lernzeit: „20 / 0 Min.“ → „20 von 330 Min.“ bzw. „20 Min. · ungeplant“; Legenden-Footer kürzen. Evidence: src/components/study-bars.tsx:12, src/app/lernen/page.tsx:54.
3. #3/#8 Gründlich – eingeklappte Kopfzeile: dreispaltiges Grid statt fester 96-px-Reserve. Evidence: src/components/page-header.tsx:50-66.
4. #8 Gründlich – Habit-Namen: zwei Zeilen statt Abschneiden. Evidence: src/components/habit-list.tsx:74.

Out of scope: Farben, Tab-Leiste, Navigation, neue Komponenten.

Deliverables: pro Fix Zieldatei, Änderung, Prüfschritt (Screenshot 375 px hell/dunkel); Tests für hero.ts anpassen.
```
