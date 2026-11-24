import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURSOR_HOTSPOT, CURSOR_KINDS, cursorSvg, cursorValue, kindOfCursor } from './cursor-art';
import { buildCursorCss, CURSOR_RULES } from './cursor-rules';

/** The Bubble cursor family as cursor images (2026-11-24, round two). */

describe('the cursor images', () => {
  it('draws every kind as a 32 px SVG that says which it is', () => {
    for (const kind of CURSOR_KINDS) {
      const svg = cursorSvg(kind);
      expect(svg).toMatch(new RegExp(`^<svg id="bcur-${kind}" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">`));
      expect(svg.endsWith('</svg>')).toBe(true);
      const [x, y] = CURSOR_HOTSPOT[kind];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(32);
    }
  });

  it('keeps the hotspot where the point is, whatever the pose', () => {
    // Every pose is applied about the hotspot, so the transform starts there.
    expect(cursorSvg('rest', { rotate: 16 })).toContain('transform="translate(3 3) rotate(16) scale(');
    expect(cursorSvg('map', { sy: 0.9 })).toContain('transform="translate(16 29) rotate(0) scale(');
  });

  it('writes a CSS cursor value with its hotspot and a system fallback, and reads the kind back', () => {
    const value = cursorValue('press', { scale: 0.84 });
    expect(value).toMatch(/^url\("data:image\/svg\+xml,%3Csvg id='bcur-press' .*"\) 3 3, pointer$/);
    expect(value).not.toMatch(/[<>#]/);
    expect(cursorValue('text')).toMatch(/ 16 16, text$/);
    expect(kindOfCursor(value)).toBe('press');
    expect(kindOfCursor('pointer')).toBeNull();
    expect(kindOfCursor('url("x.svg") 1 1, auto')).toBeNull();
  });

  it('keeps the generated CSS in step with the drawings and the rules', () => {
    const file = readFileSync(new URL('./bubble-cursor.generated.css', import.meta.url), 'utf8');
    // Run `npx tsx scripts/cursor-css.mts` after changing cursor-art.ts or cursor-rules.ts.
    expect(file).toBe(buildCursorCss());
  });

  it('lets a disabled control read as not available and a pending one as busy, over a plain press', () => {
    const order = CURSOR_RULES.map(([kind]) => kind);
    expect(order.indexOf('off')).toBeGreaterThan(order.indexOf('press'));
    expect(order.indexOf('busy')).toBeGreaterThan(order.indexOf('off'));
    expect(order.indexOf('grabbing')).toBeGreaterThan(order.indexOf('grab'));
    expect(order.indexOf('mapDrag')).toBeGreaterThan(order.indexOf('map'));
    expect(buildCursorCss()).toContain('@media (hover: hover) and (pointer: fine) and (forced-colors: none)');
    expect(buildCursorCss()).toContain(':root:not([data-pointer="system"]) { cursor: var(--bcur-rest); }');
  });
});
