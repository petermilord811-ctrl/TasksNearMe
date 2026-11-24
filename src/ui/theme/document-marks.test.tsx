/** @vitest-environment jsdom */
import { Activity } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LandingPageMarker } from '@/ui/shells/landing-page-marker';
import { restoreDocumentMarks, themeInitScript } from './theme-script';

/**
 * What a page switch must not lose (owner, 2026-11-22): the head script's marks on <html> when a language switch makes
 * <html> again, and a landing hidden by the router must stop laying out the page that replaced it.
 */

afterEach(() => cleanup());

describe('restoreDocumentMarks', () => {
  it('puts back the saved theme, the motion state and the settled logo on an <html> made again', () => {
    const root = document.createElement('html');
    restoreDocumentMarks(root, { savedTheme: 'dark', reducedMotion: true, settled: true });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-motion')).toBe('off');
    expect(root.hasAttribute('data-logo-settled')).toBe(true);
  });

  it('only fills in what is missing, and leaves the logo to the script on the first load', () => {
    const root = document.createElement('html');
    root.setAttribute('data-theme', 'light');
    root.setAttribute('data-motion', 'on');
    restoreDocumentMarks(root, { savedTheme: 'dark', reducedMotion: false, settled: false });
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-motion')).toBe('on');
    expect(root.hasAttribute('data-logo-settled')).toBe(false);
  });

  it('keeps “Use the system pointer” (the Bubble cursor stays off), and the head script sets it before the first paint', () => {
    const root = document.createElement('html');
    restoreDocumentMarks(root, { savedTheme: null, reducedMotion: false, settled: false, savedPointer: 'system' });
    expect(root.getAttribute('data-pointer')).toBe('system');
    const other = document.createElement('html');
    restoreDocumentMarks(other, { savedTheme: null, reducedMotion: false, settled: false, savedPointer: null });
    expect(other.hasAttribute('data-pointer')).toBe(false);
    expect(themeInitScript).toContain("localStorage.getItem('tnm-pointer')==='system'");
  });

  it('follows the system when nothing valid was saved', () => {
    for (const savedTheme of [null, 'sepia']) {
      const root = document.createElement('html');
      restoreDocumentMarks(root, { savedTheme, reducedMotion: false, settled: false });
      expect(root.hasAttribute('data-theme')).toBe(false);
      expect(root.getAttribute('data-motion')).toBe('ready');
    }
  });
});

describe('LandingPageMarker', () => {
  it('carries its mark while shown, drops it while the router keeps the landing hidden, and takes it back on return', () => {
    const view = render(<Activity mode="visible"><LandingPageMarker /></Activity>);
    expect(view.container.querySelector('[data-landing-page]')).not.toBeNull();
    act(() => view.rerender(<Activity mode="hidden"><LandingPageMarker /></Activity>));
    // Still in the document (for an instant Back), but nothing matches `:has([data-landing-page])` any more.
    expect(view.container.querySelector('span[hidden]')).not.toBeNull();
    expect(view.container.querySelector('[data-landing-page]')).toBeNull();
    act(() => view.rerender(<Activity mode="visible"><LandingPageMarker /></Activity>));
    expect(view.container.querySelector('[data-landing-page]')).not.toBeNull();
  });
});
