/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { pageSwitchOf, pressStateOf, sectionOf, zoneOf } from './cursor-targets';

/** What the Bubble cursor makes of the element under it (2026-11-24). */

afterEach(() => {
  document.body.innerHTML = '';
});

const page = (html: string) => {
  document.body.innerHTML = html;
  return (selector: string) => document.querySelector(selector);
};

describe('the Bubble cursor’s reading of the page', () => {
  it('steps aside over text you type into and things you drag', () => {
    const $ = page('<input id="name"><input id="tick" type="checkbox"><textarea id="note"></textarea><div class="maplibregl-map"><canvas id="map"></canvas></div><div class="cursor-grab"><span id="crop"></span></div><p id="text">Hello</p>');
    expect(zoneOf($('#name'))).toBe('text');
    expect(zoneOf($('#note'))).toBe('text');
    expect(zoneOf($('#tick'))).toBe('bubble');
    expect(zoneOf($('#map'))).toBe('native');
    expect(zoneOf($('#crop'))).toBe('native');
    expect(zoneOf($('#text'))).toBe('bubble');
  });

  it('knows what can be pressed, what is disabled, and what a link will do', () => {
    const $ = page('<a id="link" href="/x"><span id="inside">Go</span></a><a id="tab" href="/p" target="_blank">P</a><button id="sheet" aria-haspopup="dialog">Open</button><button id="off" disabled>Book</button><div aria-disabled="true"><button id="off2">B</button></div><a id="marked" href="/h" data-cursor="sheet">Help</a><p id="text">Words</p>');
    expect(pressStateOf($('#inside'))).toEqual({ hover: 'press', hint: null });
    expect(pressStateOf($('#tab'))).toEqual({ hover: 'press', hint: 'tab' });
    expect(pressStateOf($('#sheet'))).toEqual({ hover: 'press', hint: 'sheet' });
    expect(pressStateOf($('#off'))).toEqual({ hover: 'off', hint: 'off' });
    expect(pressStateOf($('#off2'))).toEqual({ hover: 'off', hint: 'off' });
    expect(pressStateOf($('#marked'))).toEqual({ hover: 'press', hint: 'sheet' });
    expect(pressStateOf($('#text'))).toEqual({ hover: null, hint: null });
  });

  it('takes the outermost landmark as the part of the page, or the dialog', () => {
    const $ = page('<header id="top"><nav><a id="nav-link" href="/">Home</a></nav></header><main id="main"><article><header><h2 id="card-title">Card</h2></header></article></main><div role="dialog" id="dialog"><header><p id="in-dialog">Hi</p></header></div><p id="loose">Loose</p>');
    expect(sectionOf($('#nav-link'))).toBe($('#top'));
    expect(sectionOf($('#card-title'))).toBe($('#main'));
    expect(sectionOf($('#in-dialog'))).toBe($('#dialog'));
    expect(sectionOf($('#loose'))).toBeNull();
  });

  it('counts a plain click on a link to another page here as a page switch, and nothing else', () => {
    const $ = page('<a id="next" href="/app/bookings">B</a><a id="same" href="/app/home#top">Top</a><a id="tab" href="/x" target="_blank">X</a><a id="away" href="https://example.com/">E</a><a id="chat" href="/app/messages/thr_1">Chat</a><a id="file" href="/f.pdf" download>F</a>');
    const here = { origin: 'http://localhost', pathname: '/app/home', search: '' };
    const click = (selector: string, over: Partial<MouseEvent> = {}) => pageSwitchOf({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: $(selector), ...over }, here);
    expect(click('#next')).toBe('/app/bookings');
    expect(click('#next', { metaKey: true })).toBeNull();
    expect(click('#next', { button: 1 })).toBeNull();
    expect(click('#same')).toBeNull();
    expect(click('#tab')).toBeNull();
    expect(click('#away')).toBeNull();
    expect(click('#chat')).toBeNull();
    expect(click('#file')).toBeNull();
  });
});
