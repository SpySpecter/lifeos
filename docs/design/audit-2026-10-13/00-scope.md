# Scope – Design-Audit LifeOS (13.10.2026)

- **Gegenstand:** LifeOS-Demo (`npm run dev:demo`, http://localhost:3000), Seiten Heute `/`, Schule `/schule`, Habits `/habits`, Lernen `/lernen`, Gesundheit `/health`, Einstellungen `/settings`
- **Geräte:** iPhone 375×812 (hell + dunkel), iPad 768×1024 (hell)
- **Nutzer:** Luis, Oberstufenschüler; die App liegt auf dem iPhone-Homescreen und läuft zusätzlich auf dem iPad
- **Hauptaufgabe:** morgens und zwischendurch auf einen Blick sehen, was heute ansteht (Stunden, Klausuren, Ausfälle, Termine, Habits, Lernen), und schnell abhaken
- **Rahmen:** Next.js 16, Tailwind 4, Apple-HIG-Stil (Systemschrift, Systemfarben, WCAG-Kontrasttest in `tests/contrast.test.ts`)
- **Referenz:** iOS-Systemapps (Erinnerungen, Wetter, Fitness)
- **Hinweis zum Ablauf:** Die Belege wurden direkt gesammelt (Browser + Code) statt über Subagenten, weil die Sitzung vorher ins Rate-Limit lief
