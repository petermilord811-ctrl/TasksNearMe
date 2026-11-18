/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { Photo } from '@/contracts';
import uiMessages from '../../../../messages/en/ui';
import { InitialsAvatar } from './initials-avatar';

afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;
const photo: Photo = { id: 'fil_jordan', src: '/api/files/fil_jordan?w=256', alt: 'Jordan T.', width: 256, height: 256 };
// next/image sets `src` again once mounted (to catch an error from before hydration), which makes it absolute.
const pathOf = (image: HTMLElement) => {
  const url = new URL(image.getAttribute('src') ?? '', 'http://localhost');
  return `${url.pathname}${url.search}`;
};

describe('InitialsAvatar (plan 9.3)', () => {
  it('shows the profile photo, named for its person', () => {
    render(withMessages(<InitialsAvatar initials="JT" photo={photo} />));
    const image = screen.getByRole('img', { name: 'Profile photo of Jordan T.' });
    expect(pathOf(image)).toBe(photo.src);
  });

  it('shows the initials without a photo', () => {
    render(withMessages(<InitialsAvatar initials="JT" />));
    expect(screen.getByRole('img', { name: 'Avatar with initials JT' }).textContent).toBe('JT');
  });

  it('falls back to the initials when the photo can’t be loaded (a missing file)', () => {
    render(withMessages(<InitialsAvatar initials="JT" photo={photo} />));
    act(() => {
      fireEvent.error(screen.getByRole('img', { name: 'Profile photo of Jordan T.' }));
    });
    expect(screen.queryByRole('img', { name: 'Profile photo of Jordan T.' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Avatar with initials JT' })).toBeTruthy();
  });

  it('tries a new photo again after an earlier one failed', () => {
    const { rerender } = render(withMessages(<InitialsAvatar initials="JT" photo={photo} />));
    act(() => {
      fireEvent.error(screen.getByRole('img', { name: 'Profile photo of Jordan T.' }));
    });
    const next = { ...photo, id: 'fil_new', src: '/api/files/fil_new?w=256' };
    rerender(withMessages(<InitialsAvatar initials="JT" photo={next} />));
    expect(pathOf(screen.getByRole('img', { name: 'Profile photo of Jordan T.' }))).toBe(next.src);
  });

  it('falls back when the image failed before the page hydrated', () => {
    // A broken image is `complete` with no natural size by the time effects run.
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    try {
      render(withMessages(<InitialsAvatar initials="JT" photo={photo} />));
      expect(screen.getByRole('img', { name: 'Avatar with initials JT' })).toBeTruthy();
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete);
      else delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
    }
  });
});
