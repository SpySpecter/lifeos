import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { DisconnectButton } from "@/components/disconnect-button";
import { MailProfileForm, ProfileForm, RuleForm, RuleList } from "@/components/settings-forms";
import { GMAIL_MODIFY, googleAccounts, hasScope } from "@/integrations/google";
import { db, plainRows } from "@/lib/db";
import { monthSpendUsd } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { WidgetSkeleton } from "@/components/widget-card";
import { github } from "@/integrations/github";
import { googleRedirectUri } from "@/integrations/google";
import { spotifyRedirectUri } from "@/integrations/spotify";
import { untis } from "@/integrations/untis";
import { env, isDemo } from "@/lib/env";
import { getToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Einstellungen" };

type State = "ok" | "todo" | "off";

function StatusLabel({ state, children }: { state: State; children: ReactNode }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "todo" ? CircleAlert : CircleDashed;
  const color = state === "ok" ? "text-good" : state === "todo" ? "text-warning" : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className={`size-4 ${color}`} aria-hidden />
      {children}
    </span>
  );
}

function Row({ id, title, description, state, status, children }: { id: string; title: string; description: string; state: State; status: string; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <StatusLabel state={state}>{status}</StatusLabel>
      </div>
      {children ? <div className="mt-3 space-y-2 text-sm">{children}</div> : null}
    </section>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{children}</code>
);

const MESSAGES: Record<string, string> = {
  demo: "Im Demo-Modus sind echte Verbindungen deaktiviert.",
  "google-config": "GOOGLE_CLIENT_ID/SECRET fehlen in der .env.",
  "spotify-config": "SPOTIFY_CLIENT_ID fehlt in der .env.",
  "google-denied": "Google-Anmeldung abgebrochen oder abgelaufen.",
  "spotify-denied": "Spotify-Anmeldung abgebrochen oder abgelaufen.",
  "google-exchange": "Google-Token konnte nicht abgerufen werden (Logs prüfen).",
  "spotify-exchange": "Spotify-Token konnte nicht abgerufen werden (Logs prüfen).",
};

async function SettingsContent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const params = await searchParams;
  const demo = isDemo();
  const e = env();
  const connectBtn = (provider: "google" | "spotify", label: string) => (
    <a href={`/api/auth/${provider}/start`} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
      {label}
    </a>
  );

  const providerState = (provider: "google" | "spotify", configured: boolean): [State, string] =>
    demo ? ["ok", "Demo"] : !configured ? ["off", "Nicht eingerichtet"] : getToken(provider) ? ["ok", "Verbunden"] : ["todo", "Nicht verbunden"];

  const accounts = demo ? [] : await googleAccounts();
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const [gState, gStatus]: [State, string] = demo
    ? ["ok", "Demo"]
    : !googleConfigured
      ? ["off", "Nicht eingerichtet"]
      : accounts.length
        ? ["ok", `${accounts.length} ${accounts.length > 1 ? "Konten" : "Konto"} verbunden`]
        : ["todo", "Nicht verbunden"];
  const settings = getSettings(db());
  const rules = plainRows<Parameters<typeof RuleList>[0]["rules"][number]>(
    db().prepare("SELECT id, pattern, action, category, source FROM mail_rules ORDER BY id DESC").all(),
  );
  const [sState, sStatus] = providerState("spotify", Boolean(e.SPOTIFY_CLIENT_ID));
  const simple = (missing: unknown): [State, string] => (demo ? ["ok", "Demo"] : missing ? ["off", "Nicht eingerichtet"] : ["ok", "Aktiv"]);
  const [uState, uStatus] = simple(untis.missingConfig());
  const [ghState, ghStatus] = simple(github.missingConfig());
  const ingestUrl = `${e.APP_URL}/api/ingest/health`;

  return (
    <div className="space-y-4">
      {params.connected ? (
        <p role="status" className="rounded-xl bg-good/10 px-4 py-3 text-sm ring-1 ring-good/30">
          {params.connected === "google" ? "Google" : "Spotify"} ist verbunden.
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="rounded-xl bg-critical/10 px-4 py-3 text-sm ring-1 ring-critical/30">
          {MESSAGES[params.error] ?? "Unbekannter Fehler."}
        </p>
      ) : null}

      <Row id="profil" title="Persönlich" description="Begrüßung, Standard-Ort fürs Wetter und deine Tagesziele." state="ok" status="">
        <ProfileForm settings={settings} />
      </Row>

      <Row id="untis" title="Schule (WebUntis)" description="Stundenplan, Ausfälle und Vertretungen der nächsten 7 Tage." state={uState} status={uStatus}>
        {uState !== "ok" ? <p>In der <Code>.env</Code> eintragen: <Code>UNTIS_SERVER</Code>, <Code>UNTIS_SCHOOL</Code>, <Code>UNTIS_USER</Code>, <Code>UNTIS_PASSWORD</Code>.</p> : null}
      </Row>

      <Row id="google" title="Google (Kalender, Gmail, Drive)" description="Mehrere Konten möglich. Kalender und Drive nur lesend; Gmail zusätzlich mit Schreibrechten für den Mail-Assistenten (Labels, Archiv, Papierkorb – nie endgültig löschen)." state={gState} status={gStatus}>
        {!demo && gState === "off" ? (
          <p>
            OAuth-Client (Typ „Webanwendung“) anlegen, Weiterleitungs-URI <Code>{googleRedirectUri()}</Code> eintragen, dann <Code>GOOGLE_CLIENT_ID</Code> und <Code>GOOGLE_CLIENT_SECRET</Code> in die <Code>.env</Code>. Anleitung: <Code>docs/SETUP.md</Code>.
          </p>
        ) : null}
        {accounts.length ? (
          <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
            {accounts.map((a) => (
              <li key={a} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{a}</span>
                {hasScope(a, GMAIL_MODIFY) ? (
                  <span className="text-xs text-muted-foreground">Mail-Sortierung aktiv</span>
                ) : (
                  <a href="/api/auth/google/start" className="text-xs font-medium text-serious underline underline-offset-4">
                    Neu verbinden für Mail-Sortierung
                  </a>
                )}
                <DisconnectButton provider={`google:${a}`} />
              </li>
            ))}
          </ul>
        ) : null}
        {!demo && googleConfigured ? connectBtn("google", accounts.length ? "Weiteres Google-Konto verbinden" : "Mit Google verbinden") : null}
      </Row>

      <Row
        id="mail"
        title="Mail-Assistent"
        description="Sortiert zweimal täglich (06:00 & 16:00) alle verbundenen Postfächer: Labels, Archiv, Papierkorb (30 Tage wiederherstellbar). Unsicheres landet im Widget zur Entscheidung."
        state={demo ? "ok" : e.OPENAI_API_KEY ? "ok" : "todo"}
        status={demo ? "Demo" : e.OPENAI_API_KEY ? `KI aktiv · ${monthSpendUsd(db()).toFixed(2)} $ von ${e.OPENAI_MONTHLY_BUDGET_USD} $ diesen Monat` : "OPENAI_API_KEY fehlt"}
      >
        <MailProfileForm profile={settings.mailProfile} />
        <div className="space-y-2 border-t pt-3">
          <h3 className="font-medium">Absender-Regeln</h3>
          <p className="text-muted-foreground">Regeln gelten vor der KI. Sicherheits-Mails und markierte Mails werden nie angefasst.</p>
          <RuleForm />
          <RuleList rules={rules} />
        </div>
      </Row>

      <Row id="spotify" title="Spotify" description="Läuft gerade, zuletzt gehört, Top-Artists der letzten 4 Wochen." state={sState} status={sStatus}>
        {!demo && sState === "off" ? (
          <p>
            App im Spotify-Developer-Dashboard anlegen (benötigt Spotify Premium), Redirect-URI <Code>{spotifyRedirectUri()}</Code>, dann <Code>SPOTIFY_CLIENT_ID</Code> in die <Code>.env</Code>.
          </p>
        ) : null}
        {!demo && sState === "todo" ? connectBtn("spotify", "Mit Spotify verbinden") : null}
        {!demo && sState === "ok" ? <DisconnectButton provider="spotify" /> : null}
      </Row>

      <Row id="github" title="GitHub" description="Beiträge, zuletzt aktive Repos mit CI-Status und offene Pull Requests." state={ghState} status={ghStatus}>
        {ghState !== "ok" ? <p>Fine-grained Token (nur lesend) als <Code>GITHUB_TOKEN</Code> in die <Code>.env</Code>.</p> : null}
      </Row>

      <Row
        id="health"
        title="iPhone-Kurzbefehl (Apple Health)"
        description="Eine tägliche Automation schickt Schritte, Schlaf, Training usw. an LifeOS."
        state={demo ? "ok" : e.INGEST_TOKEN ? "ok" : "off"}
        status={demo ? "Demo" : e.INGEST_TOKEN ? "Bereit" : "INGEST_TOKEN fehlt"}
      >
        <p>
          <span className="text-muted-foreground">Endpunkt:</span> <Code>POST {ingestUrl}</Code>
        </p>
        <p>
          <span className="text-muted-foreground">Header:</span> <Code>Authorization: Bearer &lt;INGEST_TOKEN&gt;</Code>
        </p>
        <p>
          <span className="text-muted-foreground">JSON:</span> <Code>{`{"steps": 8432, "sleep": 7.5, "workout": 45, "energy": 520, "heart": 58}`}</Code>
        </p>
        <p className="text-muted-foreground">Schritt-für-Schritt-Anleitung in <Code>docs/SETUP.md</Code>.</p>
      </Row>

      <Row id="weather" title="Wetter & Nachrichten" description="Open-Meteo am Gerätestandort (sonst Standard-Ort). Nachrichten: Tagesschau, Politik, rbb24 Region & Blaulicht, heise, The Verge, Hacker News – Meldungen aus deiner Umgebung werden hervorgehoben." state="ok" status="Aktiv" />
    </div>
  );
}

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <Suspense fallback={<WidgetSkeleton lines={8} />}>
        <SettingsContent searchParams={props.searchParams as Promise<Record<string, string | undefined>>} />
      </Suspense>
    </div>
  );
}
