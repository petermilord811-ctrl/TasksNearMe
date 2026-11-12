import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * MapLibre's web worker, served from the installed package (bundlers move maplibre-gl's main module into a
 * chunk, so its own `import.meta.url` lookup can't find the worker). The landing map points MapLibre here
 * with `setWorkerUrl(routes.assets.mapWorker(getVersion()))`: the package version is in the URL, so the
 * year-long cache never pairs a newer map with an older worker.
 */
export async function GET() {
  const file = await readFile(path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs'));
  return new Response(new Uint8Array(file), {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
