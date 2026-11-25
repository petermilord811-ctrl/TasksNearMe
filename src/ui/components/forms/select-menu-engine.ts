/**
 * Branded lists for dropdown selects where the browser can't style its own (select-menus.css explains: Chrome and
 * Edge 135+ draw ours with `appearance: base-select`, and this then does nothing). Here (Firefox, Safari on a Mac,
 * older Chrome), a press of a mouse on a select opens a listbox in the app's look instead of the browser's list:
 * - the <select> stays the source of truth: choosing sets its value and sends `input` and `change`, as the browser's
 *   list would, so React's onChange and react-hook-form see it; forms submit it as before;
 * - focus stays on the select while the list is open (so nothing validates "on blur" mid-choice): the select says
 *   `aria-expanded`, `aria-controls` and `aria-activedescendant` (its combobox role allows them), and its keys move in
 *   the list: arrows, Home/End, Page Up/Down, type-ahead; Enter or Space chooses; Escape closes; Tab closes and moves on;
 * - from the keyboard it opens where the platform's list would: Enter, Space, F4, Alt+↓/↑ (and the arrows on a Mac);
 *   elsewhere the arrows still change a closed select in place;
 * - a touch screen keeps the platform's picker (Safari on an iPhone, Firefox on Android), the better one on a phone;
 *   so do `multiple`, a `size` above 1, and anything in `[data-native-picker]`.
 */

const ELIGIBLE = 'select:not([multiple], [data-native-picker], [data-native-picker] *)';
const TYPE_AHEAD_MS = 600;
const PAGE_STEP = 8;
const GAP_PX = 6;
const EDGE_PX = 8;
const MAX_HEIGHT_PX = 352;

/** Whether the browser draws a page-styled list itself (then select-menus.css does it all). */
export function canStyleOwnList(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('appearance', 'base-select');
}

/** The select a press or a key on `target` opens our list for, if any. */
export function menuSelect(target: EventTarget | null): HTMLSelectElement | null {
  if (!(target instanceof HTMLSelectElement)) return null;
  if (target.disabled || target.multiple || target.size > 1 || !target.matches(ELIGIBLE)) return null;
  return target;
}

/** The text a node shows, leaving out any select inside it (a label that wraps its select). */
function textWithout(node: Node): string {
  if (node instanceof HTMLSelectElement) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  let text = '';
  for (const child of node.childNodes) text += textWithout(child);
  return text;
}

/** The select's name, for the listbox (its label, `aria-label` or `aria-labelledby`). */
export function nameOf(select: HTMLSelectElement): string {
  const own = select.getAttribute('aria-label')?.trim();
  if (own) return own;
  const ids = select.getAttribute('aria-labelledby');
  if (ids) {
    const text = ids.split(/\s+/).map((id) => (document.getElementById(id) ? textWithout(document.getElementById(id)!) : '')).join(' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  const label = select.labels?.[0];
  return label ? textWithout(label).replace(/\s+/g, ' ').trim() : '';
}

interface Item {
  option: HTMLOptionElement;
  row: HTMLElement;
  disabled: boolean;
}

interface OpenList {
  select: HTMLSelectElement;
  menu: HTMLElement;
  items: Item[];
  active: number;
}

let menus = 0;

export function startSelectMenus(): () => void {
  if (typeof window === 'undefined' || canStyleOwnList()) return () => {};
  const fine = typeof window.matchMedia === 'function' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
  let open: OpenList | null = null;
  let typed = '';
  let typedAt = 0;

  function build(select: HTMLSelectElement): OpenList {
    const id = `tnm-select-menu-${++menus}`;
    const menu = document.createElement('div');
    menu.className = 'tnm-select-menu';
    menu.id = id;
    menu.setAttribute('role', 'listbox');
    const name = nameOf(select);
    if (name) menu.setAttribute('aria-label', name);
    const items: Item[] = [];
    const addOption = (option: HTMLOptionElement, into: HTMLElement, groupDisabled: boolean) => {
      if (option.hidden) return;
      const row = document.createElement('div');
      row.id = `${id}-${items.length}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', option.selected ? 'true' : 'false');
      const disabled = option.disabled || groupDisabled;
      if (disabled) row.setAttribute('aria-disabled', 'true');
      const words = document.createElement('span');
      words.textContent = option.label || option.text;
      const check = document.createElement('span');
      check.className = 'tnm-select-check';
      check.setAttribute('aria-hidden', 'true');
      row.append(words, check);
      into.append(row);
      items.push({ option, row, disabled });
    };
    for (const child of select.children) {
      if (child instanceof HTMLOptionElement) addOption(child, menu, false);
      else if (child instanceof HTMLOptGroupElement) {
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', child.label);
        const label = document.createElement('div');
        label.className = 'tnm-select-group';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = child.label;
        group.append(label);
        for (const option of child.children) if (option instanceof HTMLOptionElement) addOption(option, group, child.disabled);
        menu.append(group);
      }
    }
    const chosen = items.findIndex((item) => item.option.selected && !item.disabled);
    return { select, menu, items, active: chosen >= 0 ? chosen : items.findIndex((item) => !item.disabled) };
  }

  /** Under the select (above it when there's more room there), at least as wide, inside the window. */
  function place(list: OpenList) {
    const box = list.select.getBoundingClientRect();
    const { menu } = list;
    menu.style.minWidth = `${Math.round(box.width)}px`;
    const below = window.innerHeight - box.bottom - GAP_PX - EDGE_PX;
    const above = box.top - GAP_PX - EDGE_PX;
    const natural = Math.min(menu.scrollHeight, MAX_HEIGHT_PX);
    const down = below >= natural || below >= above;
    const room = Math.max(120, Math.min(MAX_HEIGHT_PX, down ? below : above));
    menu.style.maxHeight = `${room}px`;
    const height = Math.min(natural, room);
    const width = menu.offsetWidth || box.width;
    const left = Math.max(EDGE_PX, Math.min(box.left, window.innerWidth - EDGE_PX - width));
    const top = down ? box.bottom + GAP_PX : box.top - GAP_PX - height;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.dataset.side = down ? 'bottom' : 'top';
  }

  function setActive(list: OpenList, index: number, scroll: boolean) {
    const item = list.items[index];
    if (!item || item.disabled) return;
    list.items[list.active]?.row.removeAttribute('data-active');
    list.active = index;
    item.row.setAttribute('data-active', '');
    list.select.setAttribute('aria-activedescendant', item.row.id);
    if (scroll) item.row.scrollIntoView?.({ block: 'nearest' });
  }

  /** The next enabled item from `from` in direction `step`, stopping at the ends (or `from` if there's none). */
  function step(list: OpenList, from: number, by: number): number {
    const direction = by > 0 ? 1 : -1;
    let found = from;
    let left = Math.abs(by);
    for (let index = from + direction; index >= 0 && index < list.items.length && left > 0; index += direction) {
      if (list.items[index]!.disabled) continue;
      found = index;
      left -= 1;
    }
    return found;
  }

  function openList(select: HTMLSelectElement) {
    close(false);
    const list = build(select);
    if (list.items.length === 0) return;
    open = list;
    document.body.append(list.menu);
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', list.menu.id);
    select.setAttribute('data-select-open', '');
    place(list);
    if (list.active >= 0) setActive(list, list.active, true);
    list.menu.addEventListener('mousedown', (event) => event.preventDefault());
    list.menu.addEventListener('pointermove', (event) => {
      const row = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
      const index = row ? list.items.findIndex((item) => item.row === row) : -1;
      if (index >= 0 && index !== list.active) setActive(list, index, false);
    });
    list.menu.addEventListener('click', (event) => {
      const row = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
      const index = row ? list.items.findIndex((item) => item.row === row) : -1;
      if (index >= 0) choose(index);
    });
  }

  function close(refocus: boolean) {
    const list = open;
    if (!list) return;
    open = null;
    typed = '';
    list.menu.remove();
    list.select.removeAttribute('aria-expanded');
    list.select.removeAttribute('aria-controls');
    list.select.removeAttribute('aria-activedescendant');
    list.select.removeAttribute('data-select-open');
    if (refocus && list.select.isConnected) list.select.focus({ preventScroll: true });
  }

  function choose(index: number) {
    const list = open;
    const item = list?.items[index];
    if (!list || !item || item.disabled) return;
    const { select } = list;
    const changed = select.selectedIndex !== item.option.index;
    select.selectedIndex = item.option.index;
    close(true);
    if (!changed) return;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function typeAhead(list: OpenList, key: string) {
    const now = Date.now();
    typed = now - typedAt > TYPE_AHEAD_MS ? key : typed + key;
    typedAt = now;
    const needle = typed.toLowerCase();
    // Repeating one letter goes through the options that start with it.
    const repeat = needle.length > 1 && needle.split('').every((letter) => letter === needle[0]);
    const search = repeat ? needle[0]! : needle;
    const count = list.items.length;
    const start = repeat || needle.length === 1 ? list.active + 1 : list.active;
    for (let offset = 0; offset < count; offset++) {
      const index = (((start + offset) % count) + count) % count;
      const item = list.items[index]!;
      if (!item.disabled && (item.option.label || item.option.text).trim().toLowerCase().startsWith(search)) {
        setActive(list, index, true);
        return;
      }
    }
  }

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || (fine && !fine.matches)) return;
    const select = menuSelect(event.target);
    if (!select) return;
    // The browser's own list never opens; ours does (a second press closes it).
    event.preventDefault();
    if (open?.select === select) {
      close(true);
      return;
    }
    select.focus({ preventScroll: true });
    openList(select);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const list = open;
    if (list && event.target === list.select) {
      const { key } = event;
      let handled = true;
      // Moving by key starts a new type-ahead word.
      if (key.length > 1) typed = '';
      if (key === 'ArrowDown' && !event.altKey) setActive(list, step(list, list.active, 1), true);
      else if (key === 'ArrowUp' && !event.altKey) setActive(list, step(list, list.active, -1), true);
      else if (key === 'PageDown') setActive(list, step(list, list.active, PAGE_STEP), true);
      else if (key === 'PageUp') setActive(list, step(list, list.active, -PAGE_STEP), true);
      else if (key === 'Home') setActive(list, step(list, -1, 1), true);
      else if (key === 'End') setActive(list, step(list, list.items.length, -1), true);
      else if (key === 'Enter' || (key === ' ' && !typed)) choose(list.active);
      else if (key === 'Escape' || ((key === 'ArrowUp' || key === 'ArrowDown') && event.altKey)) close(true);
      else if (key === 'Tab') {
        close(false);
        handled = false;
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeAhead(list, key);
      else handled = false;
      if (handled) {
        event.preventDefault();
        // Escape here closes the list, not a dialog around it.
        event.stopImmediatePropagation();
      }
      return;
    }
    if (fine && !fine.matches) return;
    const select = menuSelect(event.target);
    if (!select || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    const opens = key === ' ' || key === 'Enter' || key === 'F4' || ((key === 'ArrowDown' || key === 'ArrowUp') && (event.altKey || mac));
    if (!opens) return;
    // The key opened the list; nothing else on the page acts on it (a form's Enter, say).
    event.preventDefault();
    event.stopImmediatePropagation();
    openList(select);
  };

  const onPointerDown = (event: PointerEvent) => {
    const list = open;
    if (!list || !(event.target instanceof Node)) return;
    if (list.menu.contains(event.target) || event.target === list.select) return;
    close(false);
  };

  const onFocusOut = (event: FocusEvent) => {
    if (open && event.target === open.select) close(false);
  };

  const onScroll = (event: Event) => {
    if (open && !(event.target instanceof Node && open.menu.contains(event.target))) close(false);
  };

  const onResize = () => close(false);

  document.addEventListener('mousedown', onMouseDown, { capture: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('focusout', onFocusOut, { capture: true });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  return () => {
    close(false);
    document.removeEventListener('mousedown', onMouseDown, { capture: true });
    document.removeEventListener('keydown', onKeyDown, { capture: true });
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('focusout', onFocusOut, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onResize);
  };
}
