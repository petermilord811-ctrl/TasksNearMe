/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SETTLE_MS, useKeepFocusAboveBar } from './keep-focus-above-bar';

/** A 430 px tall screen (a phone with the keyboard open) whose sticky bar starts at 353. */
const BAR_TOP = 353;

function place(element: Element, top: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + height, height, left: 0, right: 360, width: 360, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
}

const scrollIntoView = vi.fn();
const scrollBy = vi.fn();

beforeEach(() => {
  // jsdom lays nothing out and scrolls nothing.
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  scrollIntoView.mockReset();
  scrollBy.mockReset();
});

function Form() {
  const area = useRef<HTMLFormElement>(null);
  const bar = useRef<HTMLElement>(null);
  useKeepFocusAboveBar(area, bar);
  return <>
    <form ref={area} aria-label="Post a task">
      <label htmlFor="description">What do you need help with?</label>
      <textarea id="description" aria-describedby="description-hint description-count" />
      <p id="description-hint">Include what needs doing.</p>
      <p id="description-count">0/2000</p>
      <footer ref={bar}><button type="button">Next</button></footer>
    </form>
    <input aria-label="Search the site" />
  </>;
}

function mount() {
  render(<Form />);
  const field = screen.getByRole('textbox', { name: 'What do you need help with?' });
  place(screen.getByRole('button', { name: 'Next' }).parentElement!, BAR_TOP, 77);
  return { field, hint: document.getElementById('description-hint')!, count: document.getElementById('description-count')! };
}

describe('useKeepFocusAboveBar (journeys on a phone, J-C-m)', () => {
  it('leaves a focused field alone when it and its hint end above the bar', () => {
    const { field, hint, count } = mount();
    place(field, 120, 64);
    place(hint, 192, 40);
    place(count, 192, 20);
    field.focus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('brings a field behind the bar to the middle of the screen, which Chrome does not do when its caret shows', () => {
    const { field, hint, count } = mount();
    place(field, BAR_TOP + 8, 64);
    place(hint, BAR_TOP + 80, 40);
    place(count, BAR_TOP + 80, 20);
    scrollIntoView.mockImplementation(() => { place(field, 200, 64); place(hint, 272, 40); place(count, 272, 20); });
    field.focus();
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'instant' });
    expect(scrollIntoView.mock.contexts[0]).toBe(field);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('also when only its hint is behind the bar, going a little further up while the hint still is', () => {
    const { field, hint, count } = mount();
    place(field, 250, 64);
    place(hint, 322, 60);
    place(count, 322, 20);
    field.focus();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    // The hint ends at 382, 29 px into the bar: 8 px of room more, and the field's top (250) stays on screen.
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 37, behavior: 'instant' });
  });

  it('checks again when the page is resized while the field has focus, as a keyboard that shrinks the page does', () => {
    const { field, hint, count } = mount();
    place(field, 120, 64);
    place(hint, 192, 40);
    place(count, 192, 20);
    field.focus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    place(field, 410, 64);
    place(hint, 482, 40);
    window.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(field);
  });

  it('waits for the click before moving a control that a press focused, which would land the click beside it', () => {
    vi.useFakeTimers();
    try {
      const { field, hint, count } = mount();
      place(field, BAR_TOP - 40, 64);
      place(hint, BAR_TOP + 30, 40);
      place(count, BAR_TOP + 30, 20);
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.focus();
      field.dispatchEvent(new Event('pointerup', { bubbles: true }));
      expect(scrollIntoView).not.toHaveBeenCalled();
      field.click();
      expect(scrollIntoView).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView.mock.contexts[0]).toBe(field);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves it shortly after the release when no click follows, and at once when the press is cancelled', () => {
    vi.useFakeTimers();
    try {
      const { field, hint, count } = mount();
      place(field, BAR_TOP - 40, 64);
      place(hint, BAR_TOP + 30, 40);
      place(count, BAR_TOP + 30, 20);
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.focus();
      field.dispatchEvent(new Event('pointerup', { bubbles: true }));
      vi.advanceTimersByTime(PRESS_SETTLE_MS - 1);
      expect(scrollIntoView).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      vi.runOnlyPendingTimers();
      expect(scrollIntoView).toHaveBeenCalledOnce();

      field.blur();
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.focus();
      window.dispatchEvent(new Event('pointercancel'));
      vi.runOnlyPendingTimers();
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the bar's own buttons, and focus outside the form, alone", () => {
    mount();
    const next = screen.getByRole('button', { name: 'Next' });
    place(next, BAR_TOP + 16, 44);
    next.focus();
    const search = screen.getByRole('textbox', { name: 'Search the site' });
    place(search, 600, 40);
    search.focus();
    window.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
