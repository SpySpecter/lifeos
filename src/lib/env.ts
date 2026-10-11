import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  DEMO_MODE: bool,
  DATA_DIR: z.string().default("./data"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TZ: z.string().default("Europe/Berlin"),

  // Zugriffsschutz: Tailscale `serve` setzt diesen Header für Nutzer im Tailnet.
  REQUIRE_TAILSCALE_AUTH: bool,
  ALLOWED_TAILSCALE_USERS: optional,
  ENCRYPTION_KEY: optional,
  INGEST_TOKEN: optional,

  UNTIS_SERVER: optional,
  UNTIS_SCHOOL: optional,
  UNTIS_USER: optional,
  UNTIS_PASSWORD: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  SPOTIFY_CLIENT_ID: optional,

  GITHUB_TOKEN: optional,

  NEWS_FEEDS: z
    .string()
    .default(
      "Tagesschau|https://www.tagesschau.de/index~rss2.xml,heise|https://www.heise.de/rss/heise-atom.xml",
    ),
  DEFAULT_LAT: z.coerce.number().default(52.52),
  DEFAULT_LON: z.coerce.number().default(13.405),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function isDemo(): boolean {
  return env().DEMO_MODE;
}

export function allowedUsers(): string[] {
  return (env().ALLOWED_TAILSCALE_USERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function newsFeeds(): { name: string; url: string }[] {
  return env()
    .NEWS_FEEDS.split(",")
    .map((entry) => entry.split("|"))
    .filter((parts) => parts.length === 2)
    .map(([name, url]) => ({ name: name.trim(), url: url.trim() }));
}
