#!/bin/bash
# One-time (and re-runnable) VPS setup for the preview site (deploy/preview/README.md).
#
#   sudo bash deploy/preview/setup-vps.sh <deploy-public-key-file> <node-binary>
#
# Creates the tnm-preview user and its folders, installs deploy.sh and a Node binary root-owned,
# lets the user restart only its own service, installs the systemd unit, and authorizes the GitHub
# Actions key for deploy.sh alone. It doesn't touch the database, preview.env or Caddy (see README).
set -euo pipefail

pubkey_file=${1:?deploy public key file}
node_binary=${2:?node binary, e.g. ~/.nvm/versions/node/v26.x/bin/node}
here=$(cd "$(dirname "$0")" && pwd)

USER_NAME=tnm-preview
ROOT=/srv/tasksnearme-preview
LIB=/usr/local/lib/tasksnearme-preview

install -d -o root -g root -m 755 "$ROOT" "$LIB"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$ROOT/home" --shell /bin/bash "$USER_NAME"
fi
usermod -aG systemd-journal "$USER_NAME"   # deploy.sh shows the service log when a release fails
chown "$USER_NAME:$USER_NAME" "$ROOT"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$ROOT/releases" "$ROOT/uploads"
install -o root -g root -m 755 "$here/deploy.sh" "$LIB/deploy.sh"
install -o root -g root -m 755 "$node_binary" "$LIB/node"

sudoers=/etc/sudoers.d/tnm-preview
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart tasksnearme-preview.service\n' "$USER_NAME" > "$sudoers.tmp"
chmod 440 "$sudoers.tmp"
visudo -cf "$sudoers.tmp" >/dev/null
mv "$sudoers.tmp" "$sudoers"

install -o root -g root -m 644 "$here/tasksnearme-preview.service" /etc/systemd/system/tasksnearme-preview.service
systemctl daemon-reload
systemctl enable tasksnearme-preview.service >/dev/null 2>&1

key=$(tr -d '\n' < "$pubkey_file")
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+ ]] || { echo "not an ed25519 public key: $pubkey_file" >&2; exit 1; }
install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$ROOT/home/.ssh"
printf 'restrict,command="%s/deploy.sh" %s\n' "$LIB" "$key" > "$ROOT/home/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "$ROOT/home/.ssh/authorized_keys"
chmod 600 "$ROOT/home/.ssh/authorized_keys"

echo "tnm-preview is ready. Still to do by hand: the database, $ROOT/preview.env and the Caddy site (README)."
