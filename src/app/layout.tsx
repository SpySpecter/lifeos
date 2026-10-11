import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BottomNav, Nav } from "@/components/nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ThemeToggle, themeScript } from "@/components/theme-toggle";
import { isDemo } from "@/lib/env";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
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
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
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
        <div className="mx-auto flex min-h-full max-w-7xl flex-col px-[max(1rem,env(safe-area-inset-left))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-10">
          <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-background/85 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur sm:-mx-6 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-foreground text-sm text-background">L</span>
              <span className="hidden sm:inline">LifeOS</span>
            </Link>
            <Nav />
            <div className="ml-auto flex items-center gap-2">
              <Suspense>
                <UserBadge />
              </Suspense>
              <ThemeToggle />
            </div>
          </header>
          <PullToRefresh />
          <main className="flex-1 pt-4">{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
