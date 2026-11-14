/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { Toaster } from './sonner';

/**
 * No keyboard trap at the toasts (WCAG 2.1.2, completion plan 5.19): Sonner gives focus back to where it came
 * from when it leaves them, for its Alt+T hotkey. A toast reached with Tab used to bounce the next Tab back to the
 * page's last link while it showed.
 */

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
});

async function page(Toasts: ComponentType) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ feedback: { notifications: 'Notifications' } }}>
      <a href="#help">Visit the help center</a>
      <Toasts />
    </NextIntlClientProvider>,
  );
  act(() => {
    toast.success('Updated');
  });
  const item = await view.findByText('Updated');
  const link = view.getByRole('link', { name: 'Visit the help center' });
  return { item: item.closest('li')!, link, focus: vi.spyOn(link, 'focus') };
}

describe.each([
  ['the app’s toaster (the root layout mounts it)', AppToaster],
  ['the toaster primitive', Toaster],
])('%s', (_name, Toasts) => {
  it('reached with Tab from the last link, the next Tab leaves them instead of going back', async () => {
    const { item, link, focus } = await page(Toasts);
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(item, { relatedTarget: link });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusOut(item, { relatedTarget: null });
    expect(focus).not.toHaveBeenCalled();
  });

  it('reached with the hotkey, leaving them gives focus back to where it was', async () => {
    const { item, link, focus } = await page(Toasts);
    fireEvent.keyDown(document, { key: 't', altKey: true });
    fireEvent.focusIn(item, { relatedTarget: link });
    fireEvent.focusOut(item, { relatedTarget: null });
    expect(focus).toHaveBeenCalled();
  });
});
