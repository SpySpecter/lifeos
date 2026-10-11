import "server-only";
import webpush from "web-push";
import { decrypt, encrypt } from "./crypto";
import type { DB } from "./db";
import { env } from "./env";

/**
 * Web Push (RFC 8030 + VAPID). Auf dem iPhone funktioniert das ab iOS 16.4 für Web-Apps auf dem Home-Bildschirm;
 * die Nachricht läuft über Apples Push-Dienst, das Gerät braucht dafür kein Tailscale.
 * Das VAPID-Schlüsselpaar erzeugt die App beim ersten Bedarf selbst und speichert es verschlüsselt in der Datenbank.
 */

const VAPID_ROW = "push:vapid";

/** Nur bekannte Push-Dienste – die App schickt sonst keine Anfragen an beliebige, vom Browser gemeldete Adressen. */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export function vapidKeys(db: DB): { publicKey: string; privateKey: string } {
  const row = db.prepare("SELECT data FROM tokens WHERE provider = ?").get(VAPID_ROW) as { data: string } | undefined;
  if (row) {
    try {
      return JSON.parse(decrypt(row.data));
    } catch {
      /* Schlüssel gewechselt → neues Paar; alte Abos sind dann ungültig */
      db.prepare("DELETE FROM push_subscriptions").run();
    }
  }
  const keys = webpush.generateVAPIDKeys();
  db.prepare(
    "INSERT INTO tokens (provider, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(provider) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).run(VAPID_ROW, encrypt(JSON.stringify(keys)), Date.now());
  return keys;
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export function saveSubscription(db: DB, sub: PushSubscriptionInput, device: string | null): void {
  if (!isPushEndpoint(sub.endpoint)) throw new Error("Unbekannter Push-Dienst");
  db.prepare(
    "INSERT INTO push_subscriptions (endpoint, p256dh, auth, device, created_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device",
  ).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, device, Date.now());
}

export function deleteSubscription(db: DB, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function countSubscriptions(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

export type Sender = (sub: PushSubscriptionInput, payload: string) => Promise<void>;

function webpushSender(db: DB): Sender {
  const keys = vapidKeys(db);
  // Apple verlangt ein https:- oder mailto:-Subject; die eigene App-Adresse verrät keine E-Mail.
  const subject = env().APP_URL.startsWith("https:") ? env().APP_URL : "mailto:lifeos@localhost";
  return async (sub, payload) => {
    await webpush.sendNotification(sub, payload, {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 6 * 3600,
      urgency: "normal",
    });
  };
}

/** An alle Geräte senden. Abgelaufene Abos (404/410) werden entfernt. */
export async function sendToAll(
  db: DB,
  msg: PushMessage,
  send: Sender = webpushSender(db),
): Promise<{ sent: number; removed: number; failed: number; errors: string[] }> {
  const subs = db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all() as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  const result = { sent: 0, removed: 0, failed: 0, errors: [] as string[] };
  const payload = JSON.stringify(msg);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        db.prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").run(Date.now(), s.endpoint);
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deleteSubscription(db, s.endpoint);
          result.removed++;
        } else {
          result.failed++;
          result.errors.push(status ? `HTTP ${status}` : (err as Error).message);
        }
      }
    }),
  );
  return result;
}
