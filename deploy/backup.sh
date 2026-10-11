#!/usr/bin/env bash
# Konsistentes SQLite-Backup im laufenden Betrieb (VACUUM INTO), 14 Tage aufbewahren.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
stamp="$(date +%F)"
docker compose exec -T lifeos node -e "
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs');
  fs.mkdirSync('/data/backups', { recursive: true });
  const target = '/data/backups/lifeos-$stamp.db';
  fs.rmSync(target, { force: true });
  new DatabaseSync('/data/lifeos.db').exec(\"VACUUM INTO '\" + target + \"'\");
  console.log('Backup:', target);
"
find data/backups -name 'lifeos-*.db' -mtime +14 -delete
