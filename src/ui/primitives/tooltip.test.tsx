/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/**
 * With the Bubble cursor, a mouse gets a trigger's words from the cursor (`data-cursor-tip`), so the tooltip's own box
 * stays closed on hover: one tip, not two (owner, 2026-11-24). With the system pointer it opens on hover as before.
 */

let media: Record<string, boolean>;
beforeEach(() => {
  media = { '(hover: hover) and (pointer: fine)': true, '(forced-colors: active)': false };
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return media[query] ?? false; }, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  document.documentElement.removeAttribute('data-pointer');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-pointer');
});

/** A mouse moving over the element; returns the event (was its default prevented?). */
function mouseOver(element: Element) {
  const move = new MouseEvent('pointermove', { bubbles: true, cancelable: true });
  Object.defineProperty(move, 'pointerType', { value: 'mouse' });
  act(() => {
    element.dispatchEvent(move);
  });
  return move;
}

function view() {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger data-cursor-tip="ID checked by our partner">ID</TooltipTrigger>
        <TooltipContent>ID checked by our partner</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  return screen.getByRole('button', { name: 'ID' });
}

it('stays closed under a mouse with the Bubble cursor (the cursor says it)', async () => {
  const move = mouseOver(view());
  expect(move.defaultPrevented).toBe(true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('opens on hover as before with the system pointer, or on a touch screen', async () => {
  document.documentElement.setAttribute('data-pointer', 'system');
  const move = mouseOver(view());
  expect(move.defaultPrevented).toBe(false);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('ID checked by our partner');
  cleanup();
  document.documentElement.removeAttribute('data-pointer');
  media['(hover: hover) and (pointer: fine)'] = false;
  expect(mouseOver(view()).defaultPrevented).toBe(false);
});
