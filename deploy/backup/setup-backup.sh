#!/bin/bash
# Installs the nightly backup on the VPS (docs/runbooks/backup-and-restore.md). The owner runs it, once and again after
# the backup code changes:
#
#   sudo bash deploy/backup/setup-backup.sh
#
# It builds backup.cjs and restore.cjs from scripts/backup and installs them root-owned in
# /usr/local/lib/tasksnearme-backup, installs the service and the timer (not enabled), and creates
# /etc/tasksnearme-backup/backup.env from the example when it's missing, and /var/backups/tasksnearme. It touches no
# database, key or bucket, and starts nothing.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run it with sudo." >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
LIB=/usr/local/lib/tasksnearme-backup
ETC=/etc/tasksnearme-backup
[[ -x /usr/local/lib/tasksnearme-preview/node ]] || { echo "No /usr/local/lib/tasksnearme-preview/node: run deploy/preview/setup-vps.sh first." >&2; exit 1; }
command -v gpg >/dev/null || { echo "gpg is missing: apt install gnupg" >&2; exit 1; }

install -d -o root -g root -m 755 "$LIB"
install -d -o root -g root -m 700 "$ETC" /var/backups/tasksnearme
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
for name in backup restore; do
  (cd "$repo" && node_modules/.bin/esbuild "scripts/backup/$name.ts" --bundle --platform=node --format=cjs --target=node22 \
    --log-level=warning --outfile="$build/$name.cjs")
  install -o root -g root -m 755 "$build/$name.cjs" "$LIB/$name.cjs"
done
[[ -f "$ETC/backup.env" ]] || install -o root -g root -m 600 "$here/backup.env.example" "$ETC/backup.env"
install -o root -g root -m 644 "$here/tasksnearme-backup.service" /etc/systemd/system/tasksnearme-backup.service
install -o root -g root -m 644 "$here/tasksnearme-backup.timer" /etc/systemd/system/tasksnearme-backup.timer
systemctl daemon-reload

cat <<NEXT
Installed. Still to do (docs/runbooks/backup-and-restore.md, "Turning it on"):
  1. Put your public key at $ETC/backup-public-key.asc (root, 644).
  2. Fill in $ETC/backup.env (the R2 bucket and its token).
  3. Run it once: sudo systemctl start tasksnearme-backup && journalctl -u tasksnearme-backup -n 30
  4. Then every night: sudo systemctl enable --now tasksnearme-backup.timer
NEXT
