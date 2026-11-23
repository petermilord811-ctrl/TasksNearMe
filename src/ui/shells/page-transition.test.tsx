/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageLevel, pageMotion, PageTransition, SkeletonReveal } from './page-transition';

afterEach(cleanup);

describe('how a page switch moves', () => {
  it('counts the app’s sections and the public pages as one level, and each segment under them as one more', () => {
    expect(pageLevel('/app')).toBe(1);
    expect(pageLevel('/app/find-work')).toBe(1);
    expect(pageLevel('/')).toBe(1);
    expect(pageLevel('/pricing')).toBe(1);
    expect(pageLevel('/app/bookings/bkg_1')).toBe(2);
    expect(pageLevel('/app/bookings/bkg_1/review')).toBe(3);
    expect(pageLevel('/gainesville/furniture-assembly')).toBe(2);
  });

  it('goes forward deeper in, back on the way up, and sideways between the tabs and pages of one level', () => {
    expect(pageMotion('/app/bookings', '/app/bookings/bkg_1')).toBe('forward');
    expect(pageMotion('/app/community', '/app/community/post_1')).toBe('forward');
    expect(pageMotion('/app/tasks/task_1/offers/offer_1', '/app/tasks/task_1')).toBe('back');
    expect(pageMotion('/app/bookings/bkg_1', '/app/bookings')).toBe('back');
    expect(pageMotion('/app', '/app/find-work')).toBe('lateral');
    expect(pageMotion('/app/bookings/bkg_1', '/app/messages/thr_1')).toBe('lateral');
    expect(pageMotion('/', '/pricing')).toBe('lateral');
  });
});

describe('PageTransition', () => {
  it('marks <html> with how each arriving page relates to the one before it, without the language prefix', () => {
    window.history.replaceState(null, '', '/app/bookings');
    render(<PageTransition><p>Bookings</p></PageTransition>).unmount();

    window.history.replaceState(null, '', '/es/app/bookings/bkg_1');
    render(<PageTransition><p>Booking</p></PageTransition>).unmount();
    expect(document.documentElement).toHaveAttribute('data-page-motion', 'forward');

    window.history.replaceState(null, '', '/app/bookings');
    render(<PageTransition><p>Bookings</p></PageTransition>).unmount();
    expect(document.documentElement).toHaveAttribute('data-page-motion', 'back');

    window.history.replaceState(null, '', '/app/find-work');
    render(<PageTransition><p>Find work</p></PageTransition>).unmount();
    expect(document.documentElement).toHaveAttribute('data-page-motion', 'lateral');
  });

  it('leaves the mark alone when a nested template mounts on the same address', () => {
    window.history.replaceState(null, '', '/app/community');
    render(<PageTransition><p>Neighbors</p></PageTransition>).unmount();
    window.history.replaceState(null, '', '/app/community/post_1');
    // The section's template and the group's both mount on this switch: the inner one speaks first.
    render(<PageTransition><PageTransition><p>Post</p></PageTransition></PageTransition>);
    expect(document.documentElement).toHaveAttribute('data-page-motion', 'forward');
    expect(screen.getByText('Post')).toBeInTheDocument();
  });

  it('hands a tap on a bar during a switch to the bar’s control under it, and only then', () => {
    const opened: string[] = [];
    const open = (event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      opened.push(event.currentTarget.getAttribute('href')!);
    };
    render(
      <PageTransition>
        <div data-mobile-bottom-nav="">
          <a href="#find-work" onClick={open}>Find work</a>
          <a href="#bookings" onClick={open}>Bookings</a>
        </div>
      </PageTransition>,
    );
    const box = (left: number) => ({ left, right: left + 80, top: 760, bottom: 800, width: 80, height: 40, x: left, y: 760, toJSON: () => ({}) }) as DOMRect;
    screen.getByRole('link', { name: 'Find work' }).getBoundingClientRect = () => box(100);
    screen.getByRole('link', { name: 'Bookings' }).getBoundingClientRect = () => box(300);
    // The tap lands on the bar's picture on the transition's overlay, which the browser reports as <html>.
    const tap = (x: number, y: number) => document.documentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));

    const matches = vi.spyOn(document.documentElement, 'matches').mockImplementation((selector: string) => selector === ':active-view-transition');
    tap(340, 780);
    tap(220, 780);
    expect(opened).toEqual(['#bookings']);

    matches.mockImplementation(() => false);
    tap(140, 780);
    expect(opened).toEqual(['#bookings']);
    matches.mockRestore();
  });

  it('renders a skeleton’s marker inside a page switch and outside one (the shell’s own skeleton)', () => {
    render(<PageTransition><div role="status"><SkeletonReveal /></div></PageTransition>);
    render(<div role="status" aria-label="shell"><SkeletonReveal /></div>);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
