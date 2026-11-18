/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVICE_PHOTO_WIDTHS, servicePhoto } from '@/shared/service-photos';
import { ServicePhoto, type ServicePhotoProps } from './service-photo';

afterEach(cleanup);

function renderPhoto(props: ServicePhotoProps, locale: 'en' | 'es' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={{}}><ServicePhoto {...props} /></NextIntlClientProvider>);
}

/** The files a srcset names. */
function srcsetFiles(img: HTMLElement) {
  return [...new Set((img.getAttribute('srcset') ?? '').split(',').map((entry) => entry.trim().split(' ')[0]))];
}

describe('ServicePhoto', () => {
  it('describes the photo in the page language and serves only the pre-sized files', () => {
    const photo = servicePhoto('yard-cleanup');
    renderPhoto({ category: 'yard-cleanup', crop: 'wide', sizes: '100vw' }, 'es');
    const img = screen.getByRole('img', { name: photo.alt.es });
    const expected = SERVICE_PHOTO_WIDTHS.wide.map((width) => `/ui/services/${photo.name}-wide-${width}.webp`);
    expect(srcsetFiles(img).sort()).toEqual([...expected].sort());
    expect(img).toHaveAttribute('src', expected[expected.length - 1]);
    // The aspect box is reserved before the photo loads.
    expect(img).toHaveAttribute('width', '1600');
    expect(img).toHaveAttribute('height', '900');
    expect(img.className).toContain('aspect-video');
  });

  it('uses the alternate photo and the square sizes when asked', () => {
    const photo = servicePhoto('computer-help', 'alternate');
    renderPhoto({ category: 'computer-help', slot: 'alternate', crop: 'square', sizes: '20rem' });
    const img = screen.getByRole('img', { name: photo.alt.en });
    expect(srcsetFiles(img).every((file) => /-square-(640|1024)\.webp$/.test(file))).toBe(true);
    expect(img.getAttribute('src')).toContain(photo.name);
  });

  it('has an empty alt when the text beside it already names the service', () => {
    const { container } = renderPhoto({ category: 'moving-help', crop: 'landscape', sizes: '33vw', decorative: true });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('loads lazily unless it is the page’s main image', () => {
    const { container, rerender } = renderPhoto({ category: 'light-cleaning', crop: 'landscape', sizes: '50vw' });
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
    rerender(<NextIntlClientProvider locale="en" messages={{}}><ServicePhoto category="light-cleaning" crop="wide" sizes="100vw" preload /></NextIntlClientProvider>);
    expect(container.querySelector('img')).not.toHaveAttribute('loading', 'lazy');
  });
});
