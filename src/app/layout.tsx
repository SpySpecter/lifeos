import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BottomNav, Nav, SettingsLink } from "@/components/nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { themeScript } from "@/components/theme";
import { isDemo } from "@/lib/env";
import "./globals.css";

// Geist nur als Rückfall außerhalb von Apple-Geräten; auf iPhone/Mac greift SF Pro (siehe globals.css)
const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LifeOS", template: "%s · LifeOS" },
  description: "Persönliches Life-Dashboard: Schule, Kalender, Gesundheit, Gewohnheiten, Code und Musik an einem Ort.",
  appleWebApp: { capable: true, title: "LifeOS", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

async function UserBadge() {
  await connection();
  if (isDemo()) {
    return (
      <span className="rounded-full bg-series-4/15 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-series-4/40">
        Demo
      </span>
    );
  }
  const h = await headers();
  const name = h.get("tailscale-user-name") ?? h.get("tailscale-user-login");
  return name ? <span className="hidden text-xs text-muted-foreground sm:inline">{name}</span> : null;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${sans.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {/* Ab sm: klassische Leiste oben. Auf dem Handy übernehmen große Titel + Tab-Leiste unten. */}
        <header className="sticky top-0 z-20 hidden border-b border-border bg-bar backdrop-blur-xl backdrop-saturate-150 sm:block">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-foreground text-sm text-background">L</span>
              <span className="hidden lg:inline">LifeOS</span>
            </Link>
            <Nav />
            <div className="ml-auto flex items-center gap-2">
              <Suspense>
                <UserBadge />
              </Suspense>
              <SettingsLink />
            </div>
          </div>
        </header>
        <div className="mx-auto flex min-h-full max-w-7xl flex-col px-[max(16px,env(safe-area-inset-left))] pb-[calc(104px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-12">
          <PullToRefresh />
          <main className="flex-1 pt-3 sm:pt-6">{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
