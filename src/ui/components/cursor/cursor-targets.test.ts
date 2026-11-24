/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { pageSwitchOf, sectionOf } from './cursor-targets';

/** What the Bubble cursor's moving moments read from the page (2026-11-24): the part of the page, and page switches. */

afterEach(() => {
  document.body.innerHTML = '';
});

const page = (html: string) => {
  document.body.innerHTML = html;
  return (selector: string) => document.querySelector(selector);
};

describe('the Bubble cursor’s reading of the page', () => {
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
