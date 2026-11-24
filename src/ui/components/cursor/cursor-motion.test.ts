/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cursorValue, kindOfCursor, type CursorKind } from './cursor-art';
import { FRAME_MS, startCursorMotion, swingPoses } from './cursor-motion';
import { savePointerPreference } from './pointer-preference';

/**
 * The Bubble cursor's moving moments (2026-11-24, round two), driven with synthetic events. The cursors themselves are
 * CSS; here each element's computed cursor is given directly (jsdom doesn't cascade cursors).
 */

let media: Record<string, boolean>;
let shown: Map<Element, CursorKind>;
let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  media = { '(hover: hover) and (pointer: fine)': true, '(forced-colors: active)': false, '(prefers-reduced-motion: reduce)': false };
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return media[query] ?? false; }, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-pointer');
  document.body.innerHTML = '<header id="top"><a id="link" href="/app/bookings">Bookings</a></header><main id="main"><p id="text">Words</p><button id="go">Go</button><button id="off" disabled>No</button><a id="tab" href="/p" target="_blank">P</a></main>';
  shown = new Map([['#link', 'press'], ['#text', 'rest'], ['#go', 'press'], ['#off', 'off'], ['#tab', 'tab'], ['#main', 'rest'], ['#top', 'rest']].map(([selector, kind]) => [$(selector), kind as CursorKind]));
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const inline = (el as HTMLElement).style?.getPropertyValue('cursor');
    if (inline) return { cursor: inline } as CSSStyleDeclaration;
    const kind = shown.get(el);
    return kind ? ({ cursor: cursorValue(kind) } as CSSStyleDeclaration) : real(el);
  });
  stop = startCursorMotion({ sheet: 'Opens here', tab: 'New tab', off: 'Not yet' });
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function $(selector: string) {
  return document.querySelector(selector)!;
}
function pointer(type: string, target: Element, init: { x?: number; y?: number; pointerType?: string; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 40, clientY: init.y ?? 60, button: init.button ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  target.dispatchEvent(event);
}
const inline = (selector: string) => ($(selector) as HTMLElement).style.getPropertyValue('cursor');
const kindOn = (selector: string) => kindOfCursor(inline(selector));

describe('the Bubble cursor’s moments', () => {
  it('swings from the tip when the mouse enters another part of the page, then gives the element its own cursor back', () => {
    pointer('pointerover', $('#link'), { x: 40, y: 10 });
    expect(inline('#link')).toBe('');
    pointer('pointerover', $('#text'), { x: 140, y: 12 });
    expect(kindOn('#text')).toBe('rest');
    expect(inline('#text')).toContain('rotate(16)');
    expect(($('#text') as HTMLElement).style.getPropertyPriority('cursor')).toBe('important');
    vi.advanceTimersByTime(FRAME_MS * 5);
    expect(inline('#text')).toBe('');
  });

  it('squeezes while pressed and springs back on release; a disabled control shakes', () => {
    pointer('pointerover', $('#go'));
    pointer('pointerdown', $('#go'));
    expect(kindOn('#go')).toBe('press');
    expect(inline('#go')).toContain('scale(0.');
    window.dispatchEvent(new MouseEvent('pointerup'));
    vi.advanceTimersByTime(FRAME_MS * 3);
    expect(inline('#go')).toBe('');
    pointer('pointerover', $('#off'));
    pointer('pointerdown', $('#off'));
    expect(kindOn('#off')).toBe('off');
    expect(inline('#off')).toContain('rotate(11)');
  });

  it('shows the words beside a link that opens a new tab after a moment', () => {
    pointer('pointerover', $('#tab'));
    expect(document.querySelector('.bcur-label')).toBeNull();
    vi.advanceTimersByTime(600);
    const label = document.querySelector<HTMLElement>('.bcur-label')!;
    expect(label.textContent).toBe('New tab');
    expect(label.hasAttribute('data-shown')).toBe(true);
    pointer('pointerover', $('#text'));
    expect(label.hasAttribute('data-shown')).toBe(false);
  });
});

describe('the cursor’s tips (the one tooltip with a mouse)', () => {
  // Owner, 2026-11-24: "you are showing tips for some buttons, but you are also showing cursor's animated styled tip
  // together, so it's conflicted. only show customized cursor's".
  beforeEach(() => {
    $('#main').insertAdjacentHTML('beforeend', [
      '<button id="reply" title="Reply" aria-label="Reply to Ruth"><svg id="reply-icon"></svg></button>',
      '<button id="bare" title="Close the chat"><svg></svg></button>',
      '<a id="help" href="/help" target="_blank" title="Help, in a new tab">Help</a>',
      '<button id="later" disabled title="Add a photo first">Send</button>',
      '<button id="badge" data-cursor-tip="ID checked by our partner">ID</button>',
      '<div id="card" title="Windsor Park"><span id="quiet" title="">No tip here</span><span id="inside">A tip from the card</span></div>',
    ].join(''));
    shown.set($('#reply'), 'press');
    shown.set($('#bare'), 'press');
    shown.set($('#help'), 'tab');
    shown.set($('#later'), 'off');
    shown.set($('#badge'), 'press');
  });
  const label = () => document.querySelector<HTMLElement>('.bcur-label');
  const shownWords = () => (label()?.hasAttribute('data-shown') ? label()!.textContent : null);

  it('says the title in place of the browser’s box, and puts the title back as the pointer leaves', () => {
    pointer('pointerover', $('#reply-icon'));
    // Set aside at once, so the browser's own box never opens; the name stays.
    expect($('#reply').hasAttribute('title')).toBe(false);
    expect($('#reply').getAttribute('data-bcur-title')).toBe('Reply');
    expect($('#reply').getAttribute('aria-label')).toBe('Reply to Ruth');
    vi.advanceTimersByTime(599);
    expect(shownWords()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(shownWords()).toBe('Reply');
    // Within the same button: the same tip goes on showing.
    pointer('pointerover', $('#reply'));
    expect(shownWords()).toBe('Reply');
    pointer('pointerover', $('#text'));
    expect(shownWords()).toBeNull();
    expect($('#reply').getAttribute('title')).toBe('Reply');
    expect($('#reply').hasAttribute('data-bcur-title')).toBe(false);
  });

  it('keeps the name of an icon button whose title was all it had while the title is away', () => {
    pointer('pointerover', $('#bare'));
    expect($('#bare').getAttribute('aria-label')).toBe('Close the chat');
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Close the chat');
    pointer('pointerover', $('#text'));
    expect($('#bare').getAttribute('title')).toBe('Close the chat');
    expect($('#bare').hasAttribute('aria-label')).toBe(false);
  });

  it('prefers the element’s own words to what it does, takes a component’s tip, and follows the nearest title', () => {
    pointer('pointerover', $('#help'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Help, in a new tab');
    pointer('pointerover', $('#later'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Add a photo first');
    pointer('pointerover', $('#badge'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('ID checked by our partner');
    expect($('#badge').hasAttribute('data-bcur-title')).toBe(false);
    pointer('pointerover', $('#inside'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Windsor Park');
    // An empty title means no tip there, as with the browser's own.
    pointer('pointerover', $('#quiet'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBeNull();
    // Without a title of its own, what it does.
    pointer('pointerover', $('#tab'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('New tab');
  });

  it('puts the tip away on a press, a scroll or a key until the pointer moves on', () => {
    pointer('pointerover', $('#reply'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Reply');
    pointer('pointerdown', $('#reply-icon'));
    expect(shownWords()).toBeNull();
    pointer('pointerover', $('#reply'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBeNull();
    // Another control: its tip again.
    pointer('pointerover', $('#bare'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Close the chat');
    window.dispatchEvent(new Event('scroll'));
    expect(shownWords()).toBeNull();
    pointer('pointerover', $('#reply'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Reply');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(shownWords()).toBeNull();
  });

  it('silences only the control pressed, never the area around it (a log, a group)', () => {
    $('#main').setAttribute('role', 'log');
    pointer('pointerdown', $('#text'));
    window.dispatchEvent(new MouseEvent('pointerup'));
    pointer('pointerover', $('#reply'));
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Reply');
  });

  it('sets a re-rendered title aside again, and gives every title back for the system pointer', async () => {
    pointer('pointerover', $('#reply'));
    vi.advanceTimersByTime(600);
    $('#reply').setAttribute('title', 'Reply to this');
    await Promise.resolve();
    expect($('#reply').hasAttribute('title')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(shownWords()).toBe('Reply to this');
    savePointerPreference('system');
    expect($('#reply').getAttribute('title')).toBe('Reply to this');
    expect(shownWords()).toBeNull();
    savePointerPreference('bubble');
  });
});

describe('the Bubble cursor’s moments, continued', () => {

  it('turns into the loading square only when a page switch takes longer than 120 ms, and stops after 10 s', () => {
    pointer('pointerover', $('#link'));
    $('#link').addEventListener('click', (event) => event.preventDefault());
    ($('#link') as HTMLElement).click();
    vi.advanceTimersByTime(100);
    expect(inline('#link')).toBe('');
    vi.advanceTimersByTime(40);
    expect(kindOn('#link')).toBe('loading');
    vi.advanceTimersByTime(10_000);
    expect(inline('#link')).toBe('');
  });

  it('stays still for “Reduce motion”, and does nothing once someone chose the system pointer', () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    pointer('pointerover', $('#link'), { x: 40, y: 10 });
    pointer('pointerover', $('#text'), { x: 140, y: 12 });
    expect(inline('#text')).toBe('');
    media['(prefers-reduced-motion: reduce)'] = false;
    savePointerPreference('system');
    expect(document.documentElement.getAttribute('data-pointer')).toBe('system');
    pointer('pointerdown', $('#go'));
    expect(inline('#go')).toBe('');
    savePointerPreference('bubble');
    expect(document.documentElement.hasAttribute('data-pointer')).toBe(false);
  });

  it('swings away from the way the mouse moves, and squashes when it comes in from above or below', () => {
    expect(swingPoses(30, 2)[0]!.rotate).toBe(16);
    expect(swingPoses(-30, 2)[0]!.rotate).toBe(-16);
    expect(swingPoses(2, 30)[0]).toEqual({ sx: 1.1, sy: 0.86 });
    expect(swingPoses(2, -30)[0]).toEqual({ sx: 0.92, sy: 1.1 });
  });
});
