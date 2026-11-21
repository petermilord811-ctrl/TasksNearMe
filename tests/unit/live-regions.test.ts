import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accessibility pass (2026-11-21), J-A7: one message, one live region. FieldError is role="alert", which a screen
 * reader announces when it's added; a slot around it that is also a live region (aria-live, or a status, alert or log
 * role) makes two regions for the same words, and a screen reader can read the error twice. The slot keeps its id
 * (the field's aria-describedby points at it) without being live. This reads every component in src/ui for the
 * pattern, since each form builds its own slot.
 */

const ROOT = path.resolve(__dirname, '../..');
const NESTED = /<(div|p|span|section)\b[^>]*(?:aria-live="(?:polite|assertive)"|role="(?:status|alert|log)")[^>]*>((?:(?!<\/\1>)[\s\S]){0,600}?)<FieldError\b/g;

function components(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'previews' ? [] : components(full);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

describe('live regions (accessibility pass, J-A7)', () => {
  it('never puts a field error, already an alert, inside another live region', () => {
    const found = components(path.join(ROOT, 'src/ui')).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return [...text.matchAll(NESTED)].map((match) => `${path.relative(ROOT, file)}:${text.slice(0, match.index).split('\n').length}`);
    });
    expect(found).toEqual([]);
  });

  it('would catch the pattern it guards against', () => {
    expect('<div id={errorId} aria-live="polite">{code && <FieldError>{message}</FieldError>}</div>'.match(NESTED)).not.toBeNull();
    expect('<p role="status">\n  {code && <FieldError>{message}</FieldError>}\n</p>'.match(NESTED)).not.toBeNull();
    expect('<div id={errorId}>{code && <FieldError>{message}</FieldError>}</div>'.match(NESTED)).toBeNull();
  });
});
