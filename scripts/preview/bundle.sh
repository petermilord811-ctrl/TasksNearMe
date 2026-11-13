#!/bin/bash
# Packs a standalone production build into preview-bundle.tgz for deploy/preview/deploy.sh: the server,
# its static files, public/, the files pages read from disk at runtime, the migrations, and prepare-db.cjs.
# Run from the repo root after `NEXT_OUTPUT=standalone npm run build` (CI does both; .github/workflows/ci.yml).
#
#   bash scripts/preview/bundle.sh [out-dir] [commit-sha]
set -euo pipefail

out=${1:-preview-bundle}
revision=${2:-$(git rev-parse HEAD)}
[[ -f .next/standalone/server.js ]] || { echo "No .next/standalone/server.js: build with NEXT_OUTPUT=standalone first." >&2; exit 1; }

rm -rf "$out" preview-bundle.tgz
mkdir -p "$out"
cp -a .next/standalone/. "$out/"
mkdir -p "$out/.next"
cp -a .next/static "$out/.next/static"
cp -a public "$out/public"

# Read from disk at runtime: help and legal pages (src/modules/content/loaders.ts) and the map worker
# (src/app/vendor/maplibre-gl-worker.mjs/route.ts).
cp -a content "$out/content"
mkdir -p "$out/node_modules/maplibre-gl/dist"
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs "$out/node_modules/maplibre-gl/dist/"

mkdir -p "$out/db"
cp -a db/migrations "$out/db/migrations"
npx esbuild scripts/preview/prepare-db.ts --bundle --platform=node --format=cjs --target=node22 \
  --external:pg-native --log-level=warning --outfile="$out/prepare-db.cjs"

# Settings come from the server's preview.env, never from the build machine.
rm -f "$out"/.env*
echo "$revision" > "$out/REVISION"

tar -C "$out" -czf preview-bundle.tgz .
du -sh "$out" preview-bundle.tgz
