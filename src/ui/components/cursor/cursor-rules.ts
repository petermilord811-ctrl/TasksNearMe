import { cursorValue, type CursorKind } from './cursor-art';

/**
 * Which elements show which of the Bubble cursor family (2026-11-24, round two). The CSS that applies them,
 * bubble-cursor.generated.css, is written from this list and cursor-art.ts by `npx tsx scripts/cursor-css.mts`
 * (cursor-art.test.ts fails while it’s out of date).
 *
 * Every rule is equally specific, high enough to win over components' own cursor classes and the map library's, so
 * the order decides: a later line wins where several match (a disabled button is "off", a pending one "busy").
 * Elements nobody lists keep what they inherit (the resting bubble) or their own system cursor (resize handles).
 * Computers with a mouse only, never with forced colors, and never once someone chose "Use the system pointer"
 * (`data-pointer="system"` on <html>, set before the first paint by theme-script.ts).
 *
 * Tailwind's cursor classes count only as whole class names. A variant such as `disabled:cursor-not-allowed` applies
 * only while its state holds: the form primitives all carry it, so matching any class that merely contains
 * `cursor-not-allowed` showed "Not yet" on every enabled field, switch, checkbox and label (owner, 2026-11-24: "if I
 * am in text field, it's shown 'Not yet' cursor as what the disabled button hover"). The state variants in use are
 * written out with their state below; `disabled:` and `aria-disabled:` are the plain disabled rules.
 */
const cls = (name: string) => `[class~="${name}"]`;

export const CURSOR_RULES: readonly (readonly [CursorKind, readonly string[]])[] = [
  ['rest', [cls('cursor-default'), cls('cursor-auto'), '.page-scrollbar']],
  ['press', [
    'a[href]', 'button', '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemradio"]', '[role="menuitemcheckbox"]',
    '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]', 'label', 'summary', 'select',
    'input[type="checkbox"]', 'input[type="radio"]', 'input[type="submit"]', 'input[type="button"]', 'input[type="reset"]', 'input[type="file"]',
    'input[type="range"]', 'input[type="color"]', cls('cursor-pointer'), '[data-cursor-state="press"]',
  ]],
  ['tab', ['a[target="_blank"]', '[data-cursor="tab"]']],
  ['sheet', ['[aria-haspopup="dialog"]', '[data-cursor="sheet"]']],
  ['text', [
    'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"], [type="image"], [type="hidden"])',
    'textarea', '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable=""] *', '[contenteditable="true"] *', cls('cursor-text'),
  ]],
  ['grab', [cls('cursor-grab'), cls('cursor-move'), '[draggable="true"]']],
  ['grabbing', [
    cls('cursor-grabbing'), `${cls('active:cursor-grabbing')}:active`, `${cls('cursor-grab')}:active`, `${cls('cursor-move')}:active`, '[draggable="true"]:active',
  ]],
  ['off', [
    ':disabled', ':disabled *', '[aria-disabled="true"]', '[aria-disabled="true"] *', cls('cursor-not-allowed'),
    `.peer:disabled ~ ${cls('peer-disabled:cursor-not-allowed')}`, '[data-cursor="off"]',
  ]],
  // A control whose part of the page hasn't hydrated yet (src/ui/primitives/gated.tsx, useHydrationGate) is getting
  // ready, not off; one that's disabled anyway (Radix marks it `data-disabled`) stays off.
  ['busy', [
    '[aria-busy="true"]', '[aria-busy="true"] *', cls('cursor-wait'), cls('cursor-progress'),
    '[data-hydrating]:not([data-disabled])', '[data-hydrating]:not([data-disabled]) *',
  ]],
  ['map', ['.maplibregl-canvas-container.maplibregl-interactive', '.maplibregl-canvas-container.maplibregl-interactive *']],
  ['mapDrag', [
    '.maplibregl-canvas-container.maplibregl-interactive:active', '.maplibregl-canvas-container.maplibregl-interactive:active *',
    '[data-map-dragging] .maplibregl-canvas-container.maplibregl-interactive', '[data-map-dragging] .maplibregl-canvas-container.maplibregl-interactive *',
  ]],
];

/**
 * Tailwind's state variants that need `:has()`, each a rule of its own keyed by its class, so the browser checks the
 * `:has()` only on the few elements that carry it. In the shared `:where()` lists above, every element of the page is
 * checked against it, and then any change to the page re-checks all their ancestors (round three: the landing
 * restyled about 390 elements a frame while the hero's examples typed). These rules are a class more specific than
 * the lists, so they win where they match: [kind, Tailwind class, what `:has()` looks for].
 */
export const CURSOR_HAS_RULES: readonly (readonly [CursorKind, string, string])[] = [
  ['off', 'has-disabled:cursor-not-allowed', ':disabled'],
  ['off', 'has-[:disabled]:cursor-not-allowed', ':disabled'],
];

/** A class name as a CSS class selector (Tailwind's `:` and brackets escaped). */
const classSelector = (name: string) => `.${name.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)}`;

const variable = (kind: CursorKind) => `--bcur-${kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
/** One ID's worth of specificity (no element has this id) puts every rule above class-based cursor styles. */
const SCOPE = ':root:not([data-pointer="system"]):not(#bcur-scope)';

export function buildCursorCss(): string {
  const kinds = [...new Set(CURSOR_RULES.map(([kind]) => kind)), 'rest' as const];
  const variables = [...new Set(kinds)].map((kind) => `  ${variable(kind)}: ${cursorValue(kind)};`).join('\n');
  const rules = CURSOR_RULES.map(([kind, selectors]) => `  ${SCOPE} :where(${selectors.join(', ')}) { cursor: var(${variable(kind)}); }`).join('\n');
  const hasRules = CURSOR_HAS_RULES.map(([kind, name, inside]) => `  ${SCOPE} ${classSelector(name)}:has(${inside}) { cursor: var(${variable(kind)}); }`).join('\n');
  return [
    '/* Generated by `npx tsx scripts/cursor-css.mts` from src/ui/components/cursor/cursor-art.ts and cursor-rules.ts: do not edit. */',
    ':root {',
    variables,
    '}',
    '',
    '@media (hover: hover) and (pointer: fine) and (forced-colors: none) {',
    `  :root:not([data-pointer="system"]) { cursor: var(${variable('rest')}); }`,
    rules,
    hasRules,
    '}',
    '',
  ].join('\n');
}
