/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts';
import { getPublicNav } from './nav';
import { NavLink } from './nav-link';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const items = getPublicNav();

/** The public nav as the header lays it out, on `path`. */
function renderNav(path: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <ul>{items.map((item) => <li key={item.id}><NavLink item={item} currentPath={path} activeClassName="is-active">{item.id}</NavLink></li>)}</ul>
    </NextIntlClientProvider>,
  );
}

/** What a tap on a nav link announces to the others (NavLink's click handler). */
function tap(href: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent('tnm:nav-tap', { detail: href }));
  });
}

describe('NavLink', () => {
  it('marks the page it is on as current', () => {
    renderNav(routes.pricing());
    const pricing = items.find((item) => item.href === routes.pricing())!;
    expect(screen.getByRole('link', { name: pricing.id })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('shows a tapped link as current at once, and the old one steps back, until the page changes', () => {
    const { rerender } = renderNav(routes.pricing());
    const other = items.find((item) => item.href !== routes.pricing())!;
    tap(other.href);
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual([other.id]);
    expect(current[0]).toHaveClass('is-active');
    // The page arrives: the address decides again.
    rerender(
      <NextIntlClientProvider locale="en" messages={{}}>
        <ul>{items.map((item) => <li key={item.id}><NavLink item={item} currentPath={other.href} activeClassName="is-active">{item.id}</NavLink></li>)}</ul>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: other.id })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('lets go of a tap that never leads anywhere', () => {
    vi.useFakeTimers();
    renderNav(routes.pricing());
    const other = items.find((item) => item.href !== routes.pricing())!;
    tap(other.href);
    expect(screen.getByRole('link', { name: other.id })).toHaveAttribute('aria-current', 'page');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('link', { name: other.id })).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });
});
