/** @vitest-environment jsdom */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { Switch } from '@/ui/primitives/switch';
import { Textarea } from '@/ui/primitives/textarea';
import type { CursorKind } from './cursor-art';
import { buildCursorCss, CURSOR_HAS_RULES, CURSOR_RULES } from './cursor-rules';

/**
 * Which Bubble cursor elements get (2026-11-24): the rules run against the real form primitives, as the server sends
 * them (before hydration) and once the page has hydrated. Every rule is equally specific, so an element shows the last
 * kind whose rule matches it; one no rule matches shows what it inherits.
 */
function cursorOf(el: Element): CursorKind {
  for (let node: Element | null = el; node; node = node.parentElement) {
    // The class-keyed `:has()` rules are a class more specific than the lists: they win where they match.
    for (const [rule, name, inside] of CURSOR_HAS_RULES) if (node.classList.contains(name) && node.matches(`:has(${inside})`)) return rule;
    let kind: CursorKind | null = null;
    for (const [rule, selectors] of CURSOR_RULES) if (selectors.some((selector) => node!.matches(selector))) kind = rule;
    if (kind) return kind;
  }
  return 'rest';
}

const find = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Nothing matches ${selector}`);
  return el;
};

/** What the server sends: gated controls still waiting for their part of the page to hydrate. */
function asSent(content: ReactNode | string) {
  document.body.innerHTML = typeof content === 'string' ? content : renderToStaticMarkup(content);
  return find;
}

let root: Root | null = null;
/** After hydration (a browser render, where the gates are open). */
function hydrated(content: ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    root = createRoot(container);
    root.render(content);
  });
  return find;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const fields = (
  <form>
    <Input aria-label="Name" />
    <Input aria-label="Locked" disabled />
    <Textarea aria-label="Note" />
    <Textarea aria-label="Closed note" disabled />
  </form>
);

const controls = (
  <div>
    <div><Checkbox id="agree" /><Label htmlFor="agree">Agree</Label></div>
    <div><Checkbox id="locked" disabled /><Label htmlFor="locked">Locked</Label></div>
    <Switch aria-label="Sounds" />
    <Switch aria-label="Sounds off" disabled />
    <Switch aria-label="Saving" aria-busy />
  </div>
);

describe('the Bubble cursor rules', () => {
  it('give an enabled field the text cursor, and "Not yet" only once it is disabled', () => {
    // The owner's report: "if I am in text field, it's shown 'Not yet' cursor as what the disabled button hover".
    const get = hydrated(fields);
    expect(get('[aria-label="Name"]').getAttribute('class')).toContain('disabled:cursor-not-allowed');
    expect(cursorOf(get('[aria-label="Name"]'))).toBe('text');
    expect(cursorOf(get('[aria-label="Note"]'))).toBe('text');
    expect(cursorOf(get('[aria-label="Locked"]'))).toBe('off');
    expect(cursorOf(get('[aria-label="Closed note"]'))).toBe('off');
  });

  it('press on enabled switches, checkboxes and their labels; disabled ones and their labels read as "off"', () => {
    const get = hydrated(controls);
    expect(cursorOf(get('#agree'))).toBe('press');
    expect(cursorOf(get('label[for="agree"]'))).toBe('press');
    expect(cursorOf(get('#locked'))).toBe('off');
    expect(get('label[for="locked"]').getAttribute('class')).toContain('peer-disabled:cursor-not-allowed');
    expect(cursorOf(get('label[for="locked"]'))).toBe('off');
    expect(cursorOf(get('[aria-label="Sounds"]'))).toBe('press');
    expect(cursorOf(get('[aria-label="Sounds off"]'))).toBe('off');
    expect(cursorOf(get('[aria-label="Saving"]'))).toBe('busy');
  });

  it('show a control that is still getting ready as busy, not "Not yet"; a disabled one stays off', () => {
    let get = asSent(fields);
    expect(get('[aria-label="Name"]').hasAttribute('data-hydrating')).toBe(true);
    expect(cursorOf(get('[aria-label="Name"]'))).toBe('busy');
    expect(cursorOf(get('[aria-label="Locked"]'))).toBe('off');
    get = asSent(controls);
    expect(cursorOf(get('#agree'))).toBe('busy');
    expect(cursorOf(get('label[for="agree"]'))).toBe('press');
    expect(cursorOf(get('#locked'))).toBe('off');
    expect(cursorOf(get('[aria-label="Sounds"]'))).toBe('busy');
    get = asSent('<button id="send" type="submit" data-hydrating disabled><span id="words">Send</span></button>');
    expect(cursorOf(get('#send'))).toBe('busy');
    expect(cursorOf(get('#words'))).toBe('busy');
  });

  it('honor a state variant only while its state holds', () => {
    const get = asSent(`
      <label id="open" class="cursor-pointer has-disabled:cursor-not-allowed"><input type="radio" name="a"> Open</label>
      <label id="taken" class="cursor-pointer has-disabled:cursor-not-allowed"><input type="radio" name="a" disabled> Taken</label>
      <label id="bracket" class="cursor-pointer has-[:disabled]:cursor-not-allowed"><input type="checkbox" disabled> Taken</label>
      <div id="drag" class="cursor-grab active:cursor-grabbing"></div>
      <div id="held" class="cursor-grabbing"></div>
      <span id="said" class="cursor-not-allowed"></span>
      <span id="hint" class="hover:underline disabled:cursor-default"></span>
    `);
    expect(cursorOf(get('#open'))).toBe('press');
    expect(cursorOf(get('#taken'))).toBe('off');
    expect(cursorOf(get('#bracket'))).toBe('off');
    expect(cursorOf(get('#drag'))).toBe('grab');
    expect(cursorOf(get('#held'))).toBe('grabbing');
    expect(cursorOf(get('#said'))).toBe('off');
    expect(cursorOf(get('#hint'))).toBe('rest');
  });

  it('keep :has() out of the lists every element is checked against (it made the landing restyle ~390 elements a frame)', () => {
    for (const [, selectors] of CURSOR_RULES) for (const selector of selectors) expect(selector).not.toContain(':has(');
    const css = buildCursorCss();
    expect(css).toContain(' .has-disabled\\:cursor-not-allowed:has(:disabled) { cursor: var(--bcur-off); }');
    expect(css).toContain(' .has-\\[\\:disabled\\]\\:cursor-not-allowed:has(:disabled) { cursor: var(--bcur-off); }');
  });

  it('tell links, new tabs, sheets and disabled buttons apart', () => {
    const get = asSent(`
      <a id="link" href="/pricing">Pricing</a>
      <a id="tab" href="/help" target="_blank">Help</a>
      <button id="sheet" type="button" aria-haspopup="dialog">Details</button>
      <button id="off" type="button" disabled><span id="inside">Send</span></button>
      <p id="plain">Words</p>
    `);
    expect(cursorOf(get('#link'))).toBe('press');
    expect(cursorOf(get('#tab'))).toBe('tab');
    expect(cursorOf(get('#sheet'))).toBe('sheet');
    expect(cursorOf(get('#off'))).toBe('off');
    expect(cursorOf(get('#inside'))).toBe('off');
    expect(cursorOf(get('#plain'))).toBe('rest');
  });
});
