import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { releasePause } from '../../scripts/lib/dev-restart.mjs';

/** A pause of the dev server ends only by the process that took it (scripts/lib/dev-restart.mjs). */

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-pause-'));
  file = path.join(dir, 'dev-pause.request');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('releasePause', () => {
  it('removes its own pause', () => {
    fs.writeFileSync(file, '4242');
    expect(releasePause(file, 4242)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("leaves a pause someone else took later (2026-11-21: a build's resume ended another session's install pause)", () => {
    fs.writeFileSync(file, '5151');
    expect(releasePause(file, 4242)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('5151');
  });

  it('does nothing when there is no pause', () => {
    expect(releasePause(file, 4242)).toBe(false);
  });
});
