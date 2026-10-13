# Urteil: REFINE

Mit 21/30 und keinem Prinzip auf 0 hat LifeOS ein tragfähiges, konsequentes System – nachzuschärfen ist vor allem die Verständlichkeit einzelner Kurzformen und zwei raue Details.

Wirksamste Schritte:
1. **#4 Verständlich – Ausfälle:** „· +1“ → „· 1 weitere“ ausschreiben. Evidenz: `src/lib/hero.ts:51`.
2. **#4/#10 Verständlich – Lernzeit:** „20 / 0 Min.“ → „20 von 330 Min.“ bzw. „20 Min. · ungeplant“; Legenden-Footer kürzen. Evidenz: `src/components/study-bars.tsx:12`, `src/app/lernen/page.tsx:54`.
3. **#3/#8 Gründlich – eingeklappte Kopfzeile:** Titel und rechte Knöpfe als dreispaltiges Grid statt fester 96-px-Reserve, damit nichts überlappt. Evidenz: `src/components/page-header.tsx:50-66`.
4. **#8 Gründlich – Habit-Namen:** zwei Zeilen statt hartem Abschneiden. Evidenz: `src/components/habit-list.tsx:74`.
