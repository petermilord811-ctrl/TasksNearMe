import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * Keyboard-only helpers for the accessibility journeys (WCAG 2.2 AA, completion plan 5.8). Nothing here clicks:
 * a control is reached with Tab (or Shift+Tab), which proves it's in the focus order, and its focus must be
 * visible. Each page a journey passes through is also checked with axe and for target sizes (2.5.8).
 */

/** Transitions off, so a focus ring is measured in its final state, not halfway through fading in. */
export async function noTransitions(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  });
}

/**
 * Waits until the page's controls react to keys: a control that needs JavaScript is unavailable until its part of
 * the page hydrates (src/ui/primitives/gated.tsx). Clicks and typing wait for that by themselves; key presses don't.
 */
export async function interactive(page: Page): Promise<void> {
  await expect(page.locator('[data-hydrating]')).toHaveCount(0, { timeout: 30_000 });
}

/** Whether `target` has focus, and what does (for the error when Tab never gets there). */
const focusOn = (target: Locator) =>
  target
    .evaluate((element) => {
      const active = document.activeElement;
      const what = !active || active === document.body ? 'body' : `${active.tagName.toLowerCase()} "${(active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 30)}"`;
      return { focused: element === active || element.contains(active), what };
    })
    .catch(() => ({ focused: false, what: 'the target is gone' }));

/**
 * Whether the focused element shows its focus: some style of it or its three nearest ancestors (outline, ring,
 * border, background, underline) differs from when it isn't focused. Measured by blurring and focusing again
 * with `focusVisible`, the way keyboard focus looks.
 */
export async function focusIsVisible(page: Page): Promise<{ visible: boolean; what: string }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { visible: false, what: 'nothing focused' };
    const chain: Element[] = [];
    for (let node: Element | null = element; node && chain.length < 4; node = node.parentElement) chain.push(node);
    const snapshot = () =>
      chain.map((node) => {
        const style = getComputedStyle(node);
        return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderColor, style.backgroundColor, style.textDecorationLine].join('|');
      });
    const focused = snapshot();
    element.blur();
    const blurred = snapshot();
    (element as HTMLElement & { focus(options?: { focusVisible?: boolean }): void }).focus({ focusVisible: true });
    const label = element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent?.trim().slice(0, 40) ?? '';
    return { visible: focused.some((value, index) => value !== blurred[index]), what: `${element.tagName.toLowerCase()} "${label}"` };
  });
}

/** Presses Tab until `target` has focus (at most `max` times), then checks the focus is visible. */
export async function tabTo(page: Page, target: Locator, options: { max?: number; backwards?: boolean } = {}): Promise<void> {
  const max = options.max ?? 120;
  await expect(target).toBeVisible();
  // Pressing Tab before the page hydrates, or past a control that is still disabled, would go round without it.
  await interactive(page);
  await expect(target).toBeEnabled();
  const path: string[] = [];
  for (let presses = 0; presses <= max; presses++) {
    const now = await focusOn(target);
    if (now.focused) {
      const focus = await focusIsVisible(page);
      expect(focus.visible, `keyboard focus should be visible on ${focus.what}`).toBe(true);
      return;
    }
    path.push(now.what);
    await page.keyboard.press(options.backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Couldn't reach ${target} with ${options.backwards ? 'Shift+Tab' : 'Tab'} in ${max} presses. Focus went: ${path.slice(0, 45).join(' → ')}`);
}

/** Tab to a control and press Enter (buttons, links). */
export async function press(page: Page, target: Locator, key = 'Enter'): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

/** Tab to a text field and type into it. */
export async function typeInto(page: Page, field: Locator, text: string): Promise<void> {
  await tabTo(page, field);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

/**
 * Pointer targets that fail WCAG 2.2 SC 2.5.8 (AA): smaller than 24 × 24 CSS px and without the spacing
 * exception (a 24 px circle on the target's centre touches another target, or another small target's circle).
 * A native input's target includes its labels, since pressing the label works the input. Skipped: links inside
 * running text (the inline exception), and visually hidden elements, such as the skip link until it has focus.
 */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="slider"]';
    type Target = { element: HTMLElement; left: number; top: number; right: number; bottom: number };
    const targets: Target[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.closest('[aria-hidden="true"], [inert], .maplibregl-map, nextjs-portal')) continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      // Visually hidden (sr-only): a hidden native input whose label is pressed, or the skip link before focus.
      if (box.width <= 2 || box.height <= 2) continue;
      // Inline links in a sentence.
      if (element.matches('a') && element.parentElement && /^(P|LI|SPAN|DD|TD|LABEL|SMALL|EM|STRONG)$/.test(element.parentElement.tagName) && (element.parentElement.textContent ?? '').trim().length > (element.textContent ?? '').trim().length + 10) continue;
      let { left, top, right, bottom } = box;
      for (const label of Array.from((element as HTMLInputElement).labels ?? [])) {
        const area = label.getBoundingClientRect();
        if (area.width === 0 || area.height === 0) continue;
        left = Math.min(left, area.left);
        top = Math.min(top, area.top);
        right = Math.max(right, area.right);
        bottom = Math.max(bottom, area.bottom);
      }
      targets.push({ element, left, top, right, bottom });
    }
    const undersized = targets.filter((target) => target.right - target.left < 24 || target.bottom - target.top < 24);
    const centre = (target: Target) => ({ x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 });
    const distanceToBox = (point: { x: number; y: number }, target: Target) => Math.hypot(Math.max(target.left - point.x, 0, point.x - target.right), Math.max(target.top - point.y, 0, point.y - target.bottom));
    const contains = (outer: Target, inner: Target) => outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
    return undersized
      .filter((target) => {
        const point = centre(target);
        return targets.some((other) => {
          if (other === target || contains(other, target) || contains(target, other) || other.element.contains(target.element) || target.element.contains(other.element)) return false;
          if (undersized.includes(other)) {
            const otherPoint = centre(other);
            return Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) < 24;
          }
          return distanceToBox(point, other) < 12;
        });
      })
      .map(({ element, left, top, right, bottom }) => {
        const name = element.getAttribute('aria-label') ?? (element.textContent?.trim().slice(0, 40) || element.getAttribute('name') || element.id);
        return `${element.tagName.toLowerCase()} "${name}" ${Math.round(right - left)}×${Math.round(bottom - top)}`;
      });
  });
}

const audited = new Set<string>();

/** axe (serious and critical) and target sizes for the page, once per path and project. */
export async function auditPage(page: Page, project: string): Promise<void> {
  const path = new URL(page.url()).pathname.replace(/(tsk|bkg|thr|off|case)_[0-9a-z_]+/g, '$1_*');
  const key = `${project}:${path}`;
  if (audited.has(key)) return;
  audited.add(key);
  // The title streams in after the page's first HTML (Next's streamed metadata): axe's document-title rule waits.
  await expect.poll(() => page.title(), { message: `a title on ${path}`, timeout: 30_000 }).not.toBe('');
  await interactive(page);
  const results = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join('; ')})`);
  expect.soft(serious, `axe on ${path}`).toEqual([]);
  expect.soft(await smallTargets(page), `targets under 24 × 24 px on ${path}`).toEqual([]);
}
