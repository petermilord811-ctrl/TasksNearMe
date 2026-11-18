#!/bin/bash
# Installs one preview release on the VPS. It's the forced command of the GitHub Actions deploy key
# (authorized_keys of tnm-preview: restrict,command="/usr/local/lib/tasksnearme-preview/deploy.sh"), so that key
# can do nothing else. The workflow runs:
#
#   ssh tnm-preview@<vps> "deploy <commit sha>" < preview-bundle.tgz
#
# Steps: unpack into releases/<sha>, migrate the preview database (and seed it when empty), switch `current`, restart
# the service, check it answers, and roll back to the previous release if it doesn't. Keeps 3 releases.
# Installed root-owned by setup-vps.sh; this copy in the repo is the source.
set -euo pipefail

ROOT=/srv/tasksnearme-preview
NODE=/usr/local/lib/tasksnearme-preview/node
SERVICE=tasksnearme-preview.service
PORT=3200

read -r verb sha extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ "${verb:-}" != deploy || ! "${sha:-}" =~ ^[0-9a-f]{40}$ || -n "${extra:-}" ]]; then
  echo "usage: deploy <40-character commit sha>  (bundle on stdin)" >&2
  exit 2
fi

exec 9>"$ROOT/deploy.lock"
flock -w 900 9 || { echo "another deploy is still running" >&2; exit 1; }

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

release="$ROOT/releases/$sha"
staging="$ROOT/releases/.incoming-$sha"
rm -rf "$staging"
mkdir -p "$staging"
trap 'rm -rf "$staging"' EXIT
log "unpacking ${sha:0:12}"
head -c 1500000000 | tar -xz -C "$staging" --no-same-owner
[[ -f "$staging/server.js" && -f "$staging/prepare-db.cjs" ]] || { echo "bundle is missing server.js or prepare-db.cjs" >&2; exit 1; }

# Uploaded files outlive releases (FILE_STORAGE=local writes to <cwd>/.data/uploads). A bundle that brought its own
# .data/uploads folder would get the link inside it, and uploads would stay in this release (plan 9.3): replace it.
mkdir -p "$staging/.data"
rm -rf "$staging/.data/uploads"
ln -sfn "$ROOT/uploads" "$staging/.data/uploads"
rm -rf "$release"
mv "$staging" "$release"

# One value from preview.env (KEY=value, optionally in double quotes), without running the file as shell.
env_value() {
  local value
  value=$(grep -m1 "^$1=" "$ROOT/preview.env" | cut -d= -f2-) || true
  value=${value#\"}
  printf '%s' "${value%\"}"
}

log "preparing the preview database (migrations; sample data if it's empty)"
(cd "$release" && DATABASE_URL="$(env_value DATABASE_URL)" FIELD_ENCRYPTION_KEY="$(env_value FIELD_ENCRYPTION_KEY)" "$NODE" prepare-db.cjs)

previous=$(readlink -f "$ROOT/current" 2>/dev/null || true)
switch_to() {
  ln -sfn "$1" "$ROOT/current.next"
  mv -T "$ROOT/current.next" "$ROOT/current"
  sudo /usr/bin/systemctl restart "$SERVICE"
}
# Asks for a few pages the way Caddy does (public host, https), so a release that only fails behind the proxy,
# such as a rewrite treated as another origin (a 307 loop on every English page), counts as broken. English
# pages go through the proxy's language rewrite; /es doesn't.
public_host=$(env_value APP_URL | sed -E 's#^https?://##; s#/.*$##')
HEALTH_PATHS=(/ /es /sign-in)
healthy() {
  for _ in $(seq 1 45); do
    local ok=1 path code
    for path in "${HEALTH_PATHS[@]}"; do
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Host: $public_host" -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$PORT$path" || true)
      [[ "$code" == 200 ]] || { ok=0; break; }
    done
    [[ $ok == 1 ]] && return 0
    sleep 2
  done
  echo "health check: $path answered $code" >&2
  return 1
}

log "starting ${sha:0:12}"
switch_to "$release"
if ! healthy; then
  echo "the new release didn't answer on :$PORT" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
  if [[ -n "$previous" && -d "$previous" && "$previous" != "$release" ]]; then
    log "rolling back to $(basename "$previous" | cut -c1-12)"
    switch_to "$previous"
    rm -rf "$release"
    if healthy; then log "rolled back: $(basename "$previous" | cut -c1-12) is live again"; else log "the previous release isn't answering either"; fi
  fi
  exit 1
fi

# Keep the 3 newest releases (and whatever `current` points at).
current=$(readlink -f "$ROOT/current")
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +4 | while read -r old; do
  [[ "$old" == "$current" ]] || rm -rf "$old"
done
log "live: ${sha:0:12}"
