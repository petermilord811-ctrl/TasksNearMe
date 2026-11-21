import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStaleCssCache, cssFingerprint, cssInputs, recordCssBuild } from '../../scripts/lib/css-fingerprint.mjs';

/** scripts/heavy.mjs clears Turbopack's build cache before an e2e build only when the CSS inputs changed. */

let root: string;
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
const cache = () => path.join(root, '.next', 'cache', 'turbopack');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'css-fingerprint-'));
  write('src/ui/theme/globals.css', '.a { color: red; }');
  write('src/ui/theme/transitions.css', '.b { opacity: 1; }');
  write('src/ui/button.tsx', 'export const b = "px-4";');
  write('next.config.ts', 'export default {};');
  write('.next/cache/turbopack/entry', 'cached');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the CSS fingerprint', () => {
  it('covers the stylesheets and the config, not components', () => {
    expect(cssInputs(root)).toEqual(['next.config.ts', 'src/ui/theme/globals.css', 'src/ui/theme/transitions.css']);
    const before = cssFingerprint(root);
    write('src/ui/button.tsx', 'export const b = "px-6";');
    expect(cssFingerprint(root)).toBe(before);
    write('src/ui/theme/globals.css', '.a { color: blue; }');
    expect(cssFingerprint(root)).not.toBe(before);
  });
});

describe('clearing the build cache', () => {
  it('clears it when nothing was recorded, then keeps it while the stylesheets stay the same', () => {
    recordCssBuild(root, clearStaleCssCache(root));
    expect(fs.existsSync(cache())).toBe(false);
    write('.next/cache/turbopack/entry', 'cached again');
    write('src/ui/button.tsx', 'export const b = "px-6";');
    recordCssBuild(root, clearStaleCssCache(root));
    expect(fs.existsSync(cache())).toBe(true);
  });

  it('clears it after a stylesheet edit, and after a config edit', () => {
    recordCssBuild(root, cssFingerprint(root));
    write('src/ui/theme/globals.css', '.a { color: blue; }');
    clearStaleCssCache(root);
    expect(fs.existsSync(cache())).toBe(false);

    recordCssBuild(root, cssFingerprint(root));
    write('.next/cache/turbopack/entry', 'cached');
    write('next.config.ts', 'export default { turbopack: {} };');
    clearStaleCssCache(root);
    expect(fs.existsSync(cache())).toBe(false);
  });

  it('records nothing for a failed build, so the next one clears again', () => {
    recordCssBuild(root, cssFingerprint(root));
    write('src/ui/theme/globals.css', '.a { color: blue; }');
    clearStaleCssCache(root); // the build that follows fails: no record
    write('.next/cache/turbopack/entry', 'from the failed build');
    clearStaleCssCache(root);
    expect(fs.existsSync(cache())).toBe(false);
  });
});
