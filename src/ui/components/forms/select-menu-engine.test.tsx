/** @vitest-environment jsdom */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canStyleOwnList, menuSelect, nameOf, startSelectMenus } from './select-menu-engine';

/**
 * The branded dropdown list where the browser can't style its own (2026-11-25; owner: "dropdown item is classic one,
 * you didn't customize"). `CSS.supports` answers as Firefox or Safari on a Mac would (jsdom's own says yes to
 * `appearance: base-select`), so the engine runs.
 */

let fine = true;
let stop: () => void = () => {};
let root: Root | null = null;

beforeEach(() => {
  fine = true;
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return query.includes('pointer: fine') ? fine : false; }, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('CSS', { supports: () => false });
  document.body.innerHTML = `
    <form>
      <label for="sort">Sort</label>
      <select id="sort" name="sort">
        <option value="soonest">Soonest</option>
        <option value="newest">Newest</option>
        <option value="nearest" disabled>Nearest</option>
        <option value="pay">Highest pay</option>
        <option value="price">Lowest price</option>
      </select>
      <label>Area <select id="area"><optgroup label="North"><option value="n1">Northwood</option><option value="n2">North Hills</option></optgroup><optgroup label="South" disabled><option value="s1">Southgate</option></optgroup></select></label>
      <span id="status-word">Status</span>
      <select id="status" aria-labelledby="status-word"><option>Active</option><option>Done</option></select>
      <div data-native-picker><select id="native" aria-label="Native"><option>A</option><option>B</option></select></div>
      <select id="many" multiple aria-label="Many"><option>A</option><option>B</option></select>
      <select id="sized" size="3" aria-label="Sized"><option>A</option><option>B</option></select>
      <button id="after" type="button">After</button>
    </form>`;
  stop = startSelectMenus();
});

afterEach(() => {
  stop();
  if (root) act(() => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const $ = <T extends Element = HTMLSelectElement>(selector: string) => document.querySelector<T>(selector)!;
function press(target: Element) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  target.dispatchEvent(event);
  return event;
}
function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const activeWords = (select: Element) => document.getElementById(select.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null;

describe('the branded dropdown list', () => {
  it('opens on a press instead of the browser’s list, chooses with a click, and tells the page as the browser’s would', () => {
    const sort = $('#sort');
    const changes: string[] = [];
    sort.addEventListener('change', (event) => changes.push((event.target as HTMLSelectElement).value));
    const inputs = vi.fn();
    sort.addEventListener('input', inputs);

    expect(press(sort).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(sort);
    expect(listbox()?.getAttribute('aria-label')).toBe('Sort');
    expect(rows().map((row) => row.textContent)).toEqual(['Soonest', 'Newest', 'Nearest', 'Highest pay', 'Lowest price']);
    expect(rows()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(rows()[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(sort.getAttribute('aria-expanded')).toBe('true');
    expect(sort.getAttribute('aria-controls')).toBe(listbox()!.id);
    expect(activeWords(sort)).toBe('Soonest');

    rows()[2]!.click();
    expect(listbox()).not.toBeNull();
    rows()[3]!.click();
    expect(sort.value).toBe('pay');
    expect(changes).toEqual(['pay']);
    expect(inputs).toHaveBeenCalledOnce();
    expect(listbox()).toBeNull();
    expect(sort.hasAttribute('aria-expanded')).toBe(false);
    expect(sort.hasAttribute('aria-activedescendant')).toBe(false);
    expect(document.activeElement).toBe(sort);

    // The same choice again changes nothing; a second press closes the list.
    press(sort);
    rows()[3]!.click();
    expect(changes).toEqual(['pay']);
    press(sort);
    expect(listbox()).not.toBeNull();
    press(sort);
    expect(listbox()).toBeNull();
  });

  it('moves with the keys, skipping what can’t be chosen, types ahead, and chooses with Enter', () => {
    const sort = $('#sort');
    const changes: string[] = [];
    sort.addEventListener('change', () => changes.push(sort.value));
    sort.focus();
    expect(key(sort, ' ').defaultPrevented).toBe(true);
    expect(activeWords(sort)).toBe('Soonest');
    expect(key(sort, 'ArrowDown').defaultPrevented).toBe(true);
    expect(activeWords(sort)).toBe('Newest');
    key(sort, 'ArrowDown');
    expect(activeWords(sort)).toBe('Highest pay');
    key(sort, 'End');
    expect(activeWords(sort)).toBe('Lowest price');
    key(sort, 'ArrowDown');
    expect(activeWords(sort)).toBe('Lowest price');
    key(sort, 'Home');
    expect(activeWords(sort)).toBe('Soonest');
    key(sort, 'PageDown');
    expect(activeWords(sort)).toBe('Lowest price');
    key(sort, 'PageUp');
    expect(activeWords(sort)).toBe('Soonest');
    key(sort, 'h');
    expect(activeWords(sort)).toBe('Highest pay');
    key(sort, 'ArrowUp');
    expect(activeWords(sort)).toBe('Newest');
    key(sort, 'l');
    key(sort, 'o');
    expect(activeWords(sort)).toBe('Lowest price');
    expect(changes).toEqual([]);
    key(sort, 'Enter');
    expect(sort.value).toBe('price');
    expect(changes).toEqual(['price']);
    expect(listbox()).toBeNull();
  });

  it('closes with Escape (not the dialog around it) without a change, and with Tab, moving on', () => {
    const sort = $('#sort');
    const changes = vi.fn();
    sort.addEventListener('change', changes);
    const reachedPage = vi.fn();
    sort.addEventListener('keydown', reachedPage);
    sort.focus();
    key(sort, 'Enter');
    key(sort, 'ArrowDown');
    expect(key(sort, 'Escape').defaultPrevented).toBe(true);
    expect(listbox()).toBeNull();
    expect(sort.value).toBe('soonest');
    expect(document.activeElement).toBe(sort);
    expect(changes).not.toHaveBeenCalled();
    // Only the keys the list used stopped there.
    expect(reachedPage.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual([]);

    key(sort, 'Enter');
    expect(key(sort, 'Tab').defaultPrevented).toBe(false);
    expect(listbox()).toBeNull();
    expect(reachedPage.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual(['Tab']);
  });

  it('opens from the keyboard where the platform’s list would: Space, Enter, F4, Alt+↓; a plain arrow changes in place', () => {
    const sort = $('#sort');
    sort.focus();
    expect(key(sort, 'ArrowDown').defaultPrevented).toBe(false);
    expect(listbox()).toBeNull();
    key(sort, 'ArrowDown', { altKey: true });
    expect(listbox()).not.toBeNull();
    key(sort, 'ArrowUp', { altKey: true });
    expect(listbox()).toBeNull();
    key(sort, 'F4');
    expect(listbox()).not.toBeNull();
    key(sort, 'Escape');
    // Clicking away closes it.
    key(sort, ' ');
    $<HTMLButtonElement>('#after').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(listbox()).toBeNull();
  });

  it('lists option groups as labelled groups; what a disabled group holds can’t be chosen', () => {
    const area = $('#area');
    press(area);
    expect(listbox()?.getAttribute('aria-label')).toBe('Area');
    const groups = [...document.querySelectorAll('[role="group"]')];
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['North', 'South']);
    expect(rows().map((row) => row.textContent)).toEqual(['Northwood', 'North Hills', 'Southgate']);
    expect(rows()[2]!.getAttribute('aria-disabled')).toBe('true');
    rows()[2]!.click();
    expect(area.value).toBe('n1');
    rows()[1]!.click();
    expect(area.value).toBe('n2');
  });

  it('names its list from aria-labelledby, aria-label or a label around the select', () => {
    expect(nameOf($('#status'))).toBe('Status');
    expect(nameOf($('#native'))).toBe('Native');
    expect(nameOf($('#area'))).toBe('Area');
  });

  it('leaves to the browser: several rows at once, opted out, disabled, a touch screen, and a browser that styles its own list', () => {
    for (const id of ['#native', '#many', '#sized']) {
      expect(menuSelect($(id))).toBeNull();
      expect(press($(id)).defaultPrevented).toBe(false);
    }
    expect(listbox()).toBeNull();
    const sort = $('#sort');
    sort.disabled = true;
    expect(press(sort).defaultPrevented).toBe(false);
    sort.disabled = false;
    fine = false;
    expect(press(sort).defaultPrevented).toBe(false);
    expect(listbox()).toBeNull();
    fine = true;

    stop();
    vi.stubGlobal('CSS', { supports: (property: string, value: string) => property === 'appearance' && value === 'base-select' });
    expect(canStyleOwnList()).toBe(true);
    stop = startSelectMenus();
    expect(press(sort).defaultPrevented).toBe(false);
    expect(listbox()).toBeNull();
  });

  it('reaches React’s onChange, controlled or registered the react-hook-form way', () => {
    const registered = vi.fn((event: { target: HTMLSelectElement }) => event.target.value);
    function Fields() {
      const [value, setValue] = useState('soonest');
      return (
        <>
          <select aria-label="Sort by" value={value} onChange={(event) => setValue(event.target.value)}>
            <option value="soonest">Soonest</option>
            <option value="newest">Newest</option>
          </select>
          <output>{value}</output>
          <select aria-label="Pricing" name="pricing" defaultValue="fixed" onChange={registered}>
            <option value="fixed">Fixed</option>
            <option value="hourly">Hourly</option>
          </select>
        </>
      );
    }
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(<Fields />);
    });
    const sortBy = host.querySelector<HTMLSelectElement>('[aria-label="Sort by"]')!;
    act(() => {
      press(sortBy);
    });
    act(() => rows()[1]!.click());
    expect(host.querySelector('output')!.textContent).toBe('newest');
    expect(sortBy.value).toBe('newest');

    const pricing = host.querySelector<HTMLSelectElement>('[aria-label="Pricing"]')!;
    act(() => {
      press(pricing);
    });
    act(() => rows()[1]!.click());
    expect(registered).toHaveBeenCalledOnce();
    expect(registered.mock.results[0]!.value).toBe('hourly');
  });
});
