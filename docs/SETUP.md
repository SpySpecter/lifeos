# LifeOS einrichten

Diese Anleitung führt durch alles, was nur du selbst erledigen kannst: Zugänge anlegen, Schlüssel eintragen und die Geräte verbinden. Reihenfolge: VPS → Tailscale → `.env` → OAuth-Verbindungen → iPhone-Kurzbefehl.

> **Platzhalter:** `<tailnet>` ist dein Tailnet-Name (`taila65db2.ts.net`), die Dashboard-URL lautet also `https://lifeos.taila65db2.ts.net`.

---

## 1. VPS vorbereiten

1. Frisches **Ubuntu 24.04** (2 vCPU / 4 GB RAM reichen, LifeOS braucht ~150–250 MB).
2. Den SSH-Schlüssel des Laptops beim Anbieter hinterlegen (oder per `ssh-copy-id root@<öffentliche-IP>`).
3. In der [Tailscale-Admin-Konsole](https://login.tailscale.com/admin/machines) den alten Eintrag `vps-6a3e96a0` löschen, damit der neue Server den Namen `lifeos` bekommt.
4. Unter **DNS** prüfen, dass **MagicDNS** und **HTTPS Certificates** aktiviert sind (wird für `tailscale serve` gebraucht).
5. Optional: das GHCR-Paket öffentlich machen (GitHub → *Packages* → `lifeos` → *Package settings* → **Public**). Nicht nötig, wenn `gh` auf dem VPS eingeloggt ist – das Skript meldet Docker dann mit deinem GitHub-Login bei GHCR an.

Dann auf dem VPS (als normaler Nutzer mit sudo):

```bash
gh auth login --web -s read:packages        # Gerätecode im Browser bestätigen
sudo git clone https://github.com/SpySpecter/lifeos /opt/lifeos
sudo bash /opt/lifeos/deploy/bootstrap-vps.sh
```

Das Skript installiert Docker, Tailscale und die GitHub CLI aus den offiziellen Paketquellen, richtet Firewall (UFW) und automatische Sicherheitsupdates ein, erzeugt `ENCRYPTION_KEY` und `INGEST_TOKEN`, startet den Container und veröffentlicht ihn per `tailscale serve` **nur im Tailnet**. Ist Tailscale noch nicht verbunden, erscheint ein Login-Link – im Browser öffnen und bestätigen. Updates holt sich der Server danach selbst (`git pull` + neues Image alle 10 Minuten).

Zum Schluss, **nachdem** du dich einmal über Tailscale verbunden hast (`ssh ubuntu@lifeos`):

```bash
sudo bash /opt/lifeos/deploy/bootstrap-vps.sh --lockdown-ssh
```

Ab dann ist der VPS aus dem Internet gar nicht mehr erreichbar (kein offener Port außer Tailscales UDP-Port).

---

## 2. `.env` ausfüllen

```bash
sudo nano /opt/lifeos/.env
cd /opt/lifeos && sudo docker compose up -d --no-build
```

| Variable | Woher |
|---|---|
| `ALLOWED_TAILSCALE_USERS` | Dein Tailscale-Login, z. B. `SpySpecter@github` (steht in der Admin-Konsole unter *Users*). |
| `UNTIS_SERVER` / `UNTIS_SCHOOL` | Aus der WebUntis-Adresse im Browser: `https://<SERVER>/WebUntis/?school=<SCHULE>`. |
| `UNTIS_USER` / `UNTIS_PASSWORD` | Dein normaler WebUntis-Login. |
| `GITHUB_TOKEN` | Siehe Abschnitt 5. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Siehe Abschnitt 3. |
| `SPOTIFY_CLIENT_ID` | Siehe Abschnitt 4. |

Nach jeder Änderung: `sudo docker compose up -d --no-build` (startet den Container mit der neuen Konfiguration neu).

---

## 3. Google (Kalender, Gmail, Drive – nur lesend)

1. [Google Cloud Console](https://console.cloud.google.com/) → neues Projekt **LifeOS**.
2. *APIs & Dienste → Bibliothek*: **Google Calendar API**, **Gmail API** und **Google Drive API** aktivieren.
3. *OAuth-Zustimmungsbildschirm* (Google Auth Platform): Typ **Extern**, App-Name „LifeOS“, deine E-Mail als Support- und Entwickleradresse.
   - Unter *Zielgruppe* dich selbst als Testnutzer eintragen.
   - Danach **„App veröffentlichen“ / In Produktion** – im Testmodus laufen die Refresh-Tokens nach 7 Tagen ab. Eine Verifizierung ist für die eigene Nutzung nicht nötig; beim Login erscheint dann „Google hat diese App nicht überprüft“ → *Erweitert* → *Weiter zu LifeOS*.
4. *Clients → Client erstellen*: Typ **Webanwendung**, autorisierte Weiterleitungs-URI:
   `https://lifeos.<tailnet>/api/auth/google/callback`
5. Client-ID und Client-Secret in die `.env`, Container neu starten.
6. Im Dashboard: **Einstellungen → Mit Google verbinden**.

Benötigte Berechtigungen: `calendar.readonly`, `gmail.readonly`, `drive.metadata.readonly`. LifeOS kann nichts senden, löschen oder ändern.

---

## 4. Spotify

> Seit Februar 2026 brauchen Spotify-Entwickler-Apps ein **Spotify-Premium-Konto** des App-Besitzers; pro Entwickler ist eine App mit bis zu 5 Nutzern erlaubt. LifeOS nutzt nur Endpunkte, die im Development Mode weiterhin verfügbar sind.

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → *Create app*.
2. Redirect URI: `https://lifeos.<tailnet>/api/auth/spotify/callback`, API: **Web API**.
3. Die **Client ID** in die `.env` (`SPOTIFY_CLIENT_ID`). Ein Client-Secret ist nicht nötig (PKCE).
4. Im Dashboard: **Einstellungen → Mit Spotify verbinden**.

---

## 5. GitHub

1. [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) → *Generate new token* (Fine-grained).
2. *Repository access*: **All repositories** (oder nur ausgewählte), *Permissions*: **Contents: Read-only**, **Metadata: Read-only**, **Pull requests: Read-only**, **Commit statuses: Read-only**.
3. Ablaufdatum z. B. 1 Jahr, Token als `GITHUB_TOKEN` in die `.env`.

---

## 6. iPhone-Kurzbefehl (Apple Health → LifeOS)

Das iPhone muss mit Tailscale verbunden sein (Tailscale-App, VPN an).

1. App **Kurzbefehle** → *Automation* → *Neue Automation* → **Tageszeit**, z. B. 22:30, täglich, **Sofort ausführen**.
2. Aktionen hinzufügen:
   1. **Health-Samples suchen**: Typ *Schritte*, Startdatum *heute*, gruppieren nach *Tag* → danach **Statistiken berechnen: Summe** (Ergebnis: *Schritte*).
   2. Genauso für *Aktive Energie* (Summe), *Trainingsminuten* (Summe), *Ruheherzfrequenz* (Durchschnitt).
   3. **Health-Samples suchen**: *Schlafanalyse*, Startdatum *gestern 18:00*, Wert *Im Bett/Schlafend* → **Statistiken berechnen: Summe** → in Stunden umrechnen (**Berechnen: ÷ 3600**, falls Sekunden).
   4. **Wörterbuch**: Schlüssel `steps`, `energy`, `workout`, `heart`, `sleep` mit den Variablen von oben (Typ Zahl).
   5. **Inhalte von URL abrufen**:
      - URL: `https://lifeos.<tailnet>/api/ingest/health`
      - Methode: **POST**
      - Header: `Authorization` = `Bearer <INGEST_TOKEN aus der .env>`
      - Anfragetext: **JSON** → das Wörterbuch.
3. Einmal manuell testen: Die Antwort sollte `{"ok":true,"day":"…","saved":5}` sein.

Zahlen mit Komma („7,5“), Tausenderpunkt („8.432“) oder als Liste werden automatisch verstanden. Optional `date` im Format `JJJJ-MM-TT` mitschicken, sonst gilt der heutige Tag.

Testen ohne iPhone:

```bash
curl -X POST https://lifeos.<tailnet>/api/ingest/health \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{"steps": 8432, "sleep": 7.5, "workout": 45}'
```

---

## 7. Auf dem iPhone/iPad als App

Safari → `https://lifeos.<tailnet>` → Teilen → **Zum Home-Bildschirm**. Für den Wetter-Standort einmal oben im Wetter-Widget auf *Standort* tippen und erlauben.

---

## Betrieb

| Aufgabe | Befehl (auf dem VPS, in `/opt/lifeos`) |
|---|---|
| Status / Logs | `docker compose ps` · `docker compose logs -f` |
| Manuell aktualisieren | `sudo systemctl start lifeos-update` (läuft sonst alle 10 min) |
| Backup jetzt | `sudo deploy/backup.sh` (läuft sonst täglich 03:30, 14 Tage Aufbewahrung in `data/backups/`) |
| Wiederherstellen | `docker compose down && rm -f data/lifeos.db-wal data/lifeos.db-shm && cp data/backups/lifeos-JJJJ-MM-TT.db data/lifeos.db && docker compose up -d --no-build` |
| Tailscale-Freigabe prüfen | `tailscale serve status` |
