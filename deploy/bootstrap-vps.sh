#!/usr/bin/env bash
# LifeOS – Einrichtung eines frischen Ubuntu-24.04-VPS (idempotent, als root ausführen).
#
#   sudo bash bootstrap-vps.sh                 # Docker, Tailscale, Firewall, LifeOS, Auto-Update, Backups
#   sudo bash bootstrap-vps.sh --lockdown-ssh  # danach: öffentliches SSH schließen (nur noch über Tailscale)
#
# Ergebnis: LifeOS läuft in Docker auf 127.0.0.1:3000 und ist NUR im Tailnet erreichbar:
#   https://<hostname>.<tailnet>.ts.net  (TLS-Zertifikat verwaltet Tailscale)
set -euo pipefail

APP_DIR=/opt/lifeos
HOSTNAME_TS="${LIFEOS_HOSTNAME:-lifeos}"
REPO_RAW="https://raw.githubusercontent.com/SpySpecter/lifeos/main"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "Bitte als root starten (sudo bash $0)"

lockdown_ssh() {
  log "Öffentliches SSH schließen"
  tailscale status >/dev/null 2>&1 || die "Tailscale ist nicht verbunden"
  local client_ip="${SSH_CLIENT%% *}"
  if [[ -n "$client_ip" && ! "$client_ip" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\. ]]; then
    die "Du bist über $client_ip verbunden, nicht über Tailscale. Erst per 'ssh root@$(tailscale ip -4)' neu verbinden."
  fi
  ufw delete allow 22/tcp >/dev/null 2>&1 || true
  ufw status verbose
  echo "SSH ist jetzt nur noch über das Tailnet erreichbar: ssh $(whoami)@$(tailscale ip -4)"
}

if [[ "${1:-}" == "--lockdown-ssh" ]]; then lockdown_ssh; exit 0; fi

log "System aktualisieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Europe/Berlin || true

log "Docker installieren"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

log "Tailscale installieren"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "Öffne gleich den angezeigten Login-Link im Browser, um den VPS deinem Tailnet hinzuzufügen."
  tailscale up --hostname="$HOSTNAME_TS" --ssh
fi

log "Firewall (UFW): eingehend nur Tailscale"
ufw default deny incoming
ufw default allow outgoing
ufw allow in on tailscale0
ufw allow 41641/udp comment 'Tailscale direkte Verbindungen'
ufw allow 22/tcp comment 'SSH (Notzugang, später: --lockdown-ssh)'
ufw --force enable

log "LifeOS nach $APP_DIR"
mkdir -p "$APP_DIR/data" "$APP_DIR/data/backups"
chown -R 1000:1000 "$APP_DIR/data"   # Container läuft als Nutzer 'node' (uid 1000)
cd "$APP_DIR"
curl -fsSL "$REPO_RAW/compose.yaml" -o compose.yaml
sed -i '/^    build: \./d' compose.yaml   # auf dem VPS wird nicht gebaut, nur gezogen
for f in lifeos-update.service lifeos-update.timer lifeos-backup.service lifeos-backup.timer; do
  curl -fsSL "$REPO_RAW/deploy/systemd/$f" -o "/etc/systemd/system/$f"
done
curl -fsSL "$REPO_RAW/deploy/backup.sh" -o "$APP_DIR/backup.sh" && chmod +x "$APP_DIR/backup.sh"

if [[ ! -f .env ]]; then
  curl -fsSL "$REPO_RAW/.env.example" -o .env
  ts_name="$(tailscale status --json | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
  sed -i "s|^APP_URL=.*|APP_URL=https://$ts_name|" .env
  sed -i "s|^DATA_DIR=.*|DATA_DIR=/data|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
  sed -i "s|^INGEST_TOKEN=.*|INGEST_TOKEN=$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')|" .env
  echo "Neue .env angelegt (Schlüssel generiert). API-Zugangsdaten bitte selbst eintragen: nano $APP_DIR/.env"
fi
chmod 600 .env

log "Container starten"
docker compose pull
docker compose up -d

log "Im Tailnet veröffentlichen (tailscale serve, kein Funnel)"
tailscale serve --bg --https=443 http://127.0.0.1:3000
tailscale serve status

log "Auto-Update (alle 10 min) und nächtliches Backup"
systemctl daemon-reload
systemctl enable --now lifeos-update.timer lifeos-backup.timer

log "Fertig"
echo "Dashboard:  https://$(tailscale status --json | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
echo "Nächste Schritte: .env ausfüllen → 'cd $APP_DIR && docker compose up -d' → OAuth in Einstellungen → '$0 --lockdown-ssh'"
