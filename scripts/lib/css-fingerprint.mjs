import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Turbopack's persistent build cache (.next/cache/turbopack) once served a stylesheet as it was before an edit
 * (2026-11-21: a rule changed in src/ui/theme/globals.css, run through the @tailwindcss/turbopack loader, was still
 * the old one in the next e2e build). New class names in components did reach the built CSS. So scripts/heavy.mjs
 * clears that cache before an e2e build whenever a stylesheet, or the configuration of the loader that reads them,
 * changed since the last build it made here. CI always builds without a cache.
 */

/** The files whose content decides the built CSS beyond the class names: every .css file under src, and the config. */
export function cssInputs(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) found.push(full);
    }
  };
  const src = path.join(root, 'src');
  if (fs.existsSync(src)) walk(src);
  for (const name of ['next.config.ts', 'next.config.mjs', 'postcss.config.mjs', 'postcss.config.js']) {
    const full = path.join(root, name);
    if (fs.existsSync(full)) found.push(full);
  }
  return found.map((file) => path.relative(root, file)).sort();
}

/** A hash of those files' names and contents. */
export function cssFingerprint(root) {
  const hash = createHash('sha256');
  for (const file of cssInputs(root)) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  }
  return hash.digest('hex');
}

const fingerprintFile = (root) => path.join(root, '.next', 'cache', 'css-fingerprint');
const turbopackCache = (root) => path.join(root, '.next', 'cache', 'turbopack');

/**
 * Before an e2e build: clears the Turbopack build cache when the CSS inputs differ from those of the last build made
 * here (or nobody recorded them). Returns the fingerprint, which `recordCssBuild` stores once the build succeeds.
 */
export function clearStaleCssCache(root, log = () => {}) {
  const now = cssFingerprint(root);
  let before = null;
  try {
    before = fs.readFileSync(fingerprintFile(root), 'utf8').trim();
  } catch {
    // Never recorded: clear, to be sure.
  }
  if (before !== now && fs.existsSync(turbopackCache(root))) {
    log(before ? 'A stylesheet or the CSS config changed since the last e2e build: clearing Turbopack’s build cache.' : 'No record of the last e2e build’s stylesheets: clearing Turbopack’s build cache.');
    fs.rmSync(turbopackCache(root), { recursive: true, force: true });
  }
  return now;
}

export function recordCssBuild(root, fingerprint) {
  fs.mkdirSync(path.dirname(fingerprintFile(root)), { recursive: true });
  fs.writeFileSync(fingerprintFile(root), `${fingerprint}\n`);
}
