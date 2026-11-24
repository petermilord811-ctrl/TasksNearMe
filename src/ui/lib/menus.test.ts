/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAfterMenu } from './menus';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('openAfterMenu', () => {
  it('opens straight away for a link outside any menu', () => {
    document.body.innerHTML = '<a id="plain" href="/help">Help</a>';
    const open = vi.fn();
    openAfterMenu(document.getElementById('plain')!, open);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('sends Escape to the menu around a caught link, and opens once the menu has gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
    document.body.innerHTML = '<div role="menu"><a href="/helpers/sam-k" role="menuitem">View profile</a></div>';
    const keys: string[] = [];
    const listen = (event: KeyboardEvent) => keys.push(event.key);
    document.addEventListener('keydown', listen);
    const open = vi.fn();
    try {
      openAfterMenu(document.querySelector('[role="menuitem"]')!, open);
      expect(keys).toEqual(['Escape']);
      await vi.advanceTimersByTimeAsync(100);
      expect(open).not.toHaveBeenCalled();
      document.querySelector('[role="menu"]')!.remove();
      await vi.advanceTimersByTimeAsync(50);
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', listen);
    }
  });
});
