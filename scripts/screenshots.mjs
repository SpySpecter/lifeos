// Erzeugt die README-Screenshots aus dem Demo-Modus.
// Nutzung: Server mit `npm run dev:demo` (oder DEMO_MODE=true npm start) starten, dann `npm run screenshots`.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";

const shots = [
  { name: "dashboard-dark", path: "/", theme: "dark", viewport: { width: 1440, height: 1500 } },
  { name: "dashboard-light", path: "/", theme: "light", viewport: { width: 1440, height: 1500 } },
  { name: "health", path: "/health", theme: "dark", viewport: { width: 1440, height: 1100 } },
  { name: "habits", path: "/habits", theme: "light", viewport: { width: 1440, height: 800 } },
  { name: "mobile", path: "/", theme: "dark", viewport: { width: 390, height: 1400 }, mobile: true },
];

const browser = await chromium.launch();
for (const s of shots) {
  const context = await browser.newContext({
    viewport: s.viewport,
    deviceScaleFactor: 2,
    isMobile: Boolean(s.mobile),
    colorScheme: s.theme,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
  });
  await context.addInitScript((theme) => localStorage.setItem("lifeos-theme", theme), s.theme);
  const page = await context.newPage();
  await page.goto(BASE + s.path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // Diagramme und gestreamte Widgets
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: !s.mobile });
  console.log("✓", s.name);
  await context.close();
}
await browser.close();
