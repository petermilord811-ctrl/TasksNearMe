/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '@/contracts';
import { communityPhotos } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PostPhotos } from './post-photos';

afterEach(cleanup);
// jsdom has no IntersectionObserver: a quiet one keeps the photos beside the one showing lazy, as off screen.
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  return () => vi.unstubAllGlobals();
});

const three: Photo[] = [communityPhotos.lake, communityPhotos.herons, communityPhotos.path];
const show = (photos: Photo[], props: { compact?: boolean } = {}) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
  <PostPhotos photos={photos} label="The sunset over the lake" {...props} />
</NextIntlClientProvider>);

/** jsdom lays nothing out: give the carousel's strip a width and a scroll position that scrollTo moves. */
function strip(width = 300) {
  const node = screen.getByRole('group', { name: '1 of 3' }).parentElement!;
  let left = 0;
  Object.defineProperty(node, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(node, 'scrollLeft', { configurable: true, get: () => left, set: (value: number) => { left = value; } });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    left = options.left ?? left;
    fireEvent.scroll(node);
  });
  node.scrollTo = scrollTo as unknown as typeof node.scrollTo;
  return { node, scrollTo, swipeTo: (at: number) => { left = at * width; fireEvent.scroll(node); } };
}
const counter = (carousel: HTMLElement) => carousel.querySelector('[aria-hidden="true"].tabular-nums')?.textContent;

describe('PostPhotos', () => {
  it('shows one photo across the card, with no carousel', async () => {
    const user = userEvent.setup();
    show([communityPhotos.lake]);
    expect(screen.queryByRole('group')).toBeNull();
    const photo = screen.getByRole('button', { name: 'Open photo 1 of 1' });
    await user.click(photo);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 1' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(photo).toHaveFocus();
  });

  it('shows two or more as a carousel: one photo at a time, a counter, a next arrow and one tab stop', () => {
    show(three);
    const carousel = screen.getByRole('group', { name: '3 photos: The sunset over the lake' });
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    const slides = within(carousel).getAllByRole('group');
    expect(slides.map((slide) => slide.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(slides.every((slide) => slide.getAttribute('aria-roledescription') === 'slide')).toBe(true);
    expect(within(carousel).getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(three.map((photo) => photo.alt));
    expect(within(carousel).getAllByRole('button', { name: /^Open photo/ }).map((button) => button.tabIndex)).toEqual([0, -1, -1]);
    expect(counter(carousel)).toBe('1/3');
    expect(within(carousel).queryByRole('button', { name: 'Previous photo' })).toBeNull();
    expect(within(carousel).getByRole('button', { name: 'Next photo' })).toBeInTheDocument();
  });

  it('steps with the arrows, and follows a swipe', async () => {
    const user = userEvent.setup();
    show(three);
    const carousel = screen.getByRole('group', { name: /^3 photos/ });
    const { scrollTo, swipeTo } = strip();

    await user.click(within(carousel).getByRole('button', { name: 'Next photo' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: 'smooth' });
    expect(counter(carousel)).toBe('2/3');
    expect(within(carousel).getByText('Photo 2 of 3')).toHaveAttribute('aria-live', 'polite');
    expect(within(carousel).getAllByRole('button', { name: /^Open photo/ }).map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    expect(within(carousel).getByRole('button', { name: 'Previous photo' })).toBeInTheDocument();

    // The last photo has no next arrow: the one that was focused hands its focus to the photo now showing.
    const next = within(carousel).getByRole('button', { name: 'Next photo' });
    next.focus();
    await user.keyboard('{Enter}');
    expect(counter(carousel)).toBe('3/3');
    expect(within(carousel).queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(within(carousel).getByRole('button', { name: 'Open photo 3 of 3' })).toHaveFocus();

    swipeTo(0);
    expect(counter(carousel)).toBe('1/3');
    expect(within(carousel).queryByRole('button', { name: 'Previous photo' })).toBeNull();
  });

  it('keeps focus with two photos, where an arrow is alone at each end', async () => {
    const user = userEvent.setup();
    show([communityPhotos.lake, communityPhotos.herons]);
    const carousel = screen.getByRole('group', { name: '2 photos: The sunset over the lake' });
    const node = within(carousel).getByRole('group', { name: '1 of 2' }).parentElement!;
    let left = 0;
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(node, 'scrollLeft', { configurable: true, get: () => left });
    node.scrollTo = ((options: ScrollToOptions) => { left = options.left ?? left; fireEvent.scroll(node); }) as typeof node.scrollTo;
    within(carousel).getByRole('button', { name: 'Next photo' }).focus();
    await user.keyboard('{Enter}');
    expect(within(carousel).getByRole('button', { name: 'Open photo 2 of 2' })).toHaveFocus();
    within(carousel).getByRole('button', { name: 'Previous photo' }).focus();
    await user.keyboard('{Enter}');
    expect(within(carousel).getByRole('button', { name: 'Open photo 1 of 2' })).toHaveFocus();
    expect(counter(carousel)).toBe('1/2');
  });

  it('moves with the keyboard from a photo, focus going along', async () => {
    const user = userEvent.setup();
    show(three);
    const carousel = screen.getByRole('group', { name: /^3 photos/ });
    const { scrollTo } = strip();
    const [first, second] = within(carousel).getAllByRole('button', { name: /^Open photo/ });
    first!.focus();
    await user.keyboard('{ArrowRight}');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: 'smooth' });
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(first).toHaveFocus();
    expect(counter(carousel)).toBe('1/3');
  });

  it('jumps without sliding when the visitor asks for reduced motion', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
    show(three);
    const { scrollTo } = strip();
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: 'instant' });
  });

  it('opens the viewer on the photo tapped, and closing it leaves the carousel on the photo last seen', async () => {
    const user = userEvent.setup();
    show(three);
    const carousel = screen.getByRole('group', { name: /^3 photos/ });
    const { scrollTo } = strip();
    await user.click(within(carousel).getByRole('button', { name: 'Open photo 1 of 3' }));
    const viewer = screen.getByRole('dialog', { name: 'Photo 1 of 3' });
    await user.click(within(viewer).getByRole('button', { name: 'Next photo' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog', { name: 'Photo 3 of 3' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: 'instant' });
    expect(counter(carousel)).toBe('3/3');
    expect(within(carousel).getByRole('button', { name: 'Open photo 3 of 3' })).toHaveFocus();
  });

  it('shows a reply its one photo, small', () => {
    show(three, { compact: true });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Open photo 1 of 1' })).toBeInTheDocument();
  });
});
