import { describe, expect, it } from 'vitest';
import { LIVE_SITE_INDEXING, robotsHeaderFor, searchIndexing } from './search-indexing';

const LIVE = { APP_URL: 'https://tasksnearme.com' };
const production = { production: true };
const development = { production: false };

describe('searchIndexing', () => {
  it('the live site follows the committed choice: the site pages, not the listings (the owner, 2026-11-14)', () => {
    // At launch this becomes 'on': change LIVE_SITE_INDEXING and this line together.
    expect(LIVE_SITE_INDEXING).toBe('site');
    expect(searchIndexing(LIVE, production)).toBe('site');
    expect(searchIndexing({ APP_URL: 'https://tasksnearme.com/' }, production)).toBe('site');
  });

  it('every other copy stays off: development, the e2e build, other addresses', () => {
    expect(searchIndexing(LIVE, development)).toBe('off');
    expect(searchIndexing({}, production)).toBe('off');
    for (const url of ['https://dev.tasksnearme.com', 'http://localhost:3000', 'https://www.tasksnearme.com', 'https://tasksnearme.com.example.org', 'not a url']) {
      expect(searchIndexing({ APP_URL: url }, production), url).toBe('off');
    }
  });

  it('SEARCH_INDEXING overrides it, in any case and with stray spaces; other values are ignored', () => {
    expect(searchIndexing({ SEARCH_INDEXING: 'on' }, development)).toBe('on');
    expect(searchIndexing({ SEARCH_INDEXING: ' Site ' }, development)).toBe('site');
    expect(searchIndexing({ ...LIVE, SEARCH_INDEXING: 'OFF\n' }, production)).toBe('off');
    expect(searchIndexing({ ...LIVE, SEARCH_INDEXING: 'on' }, production)).toBe('on');
    for (const value of ['', 'true', '1', 'yes', 'all']) {
      expect(searchIndexing({ SEARCH_INDEXING: value }, development), value).toBe('off');
      expect(searchIndexing({ ...LIVE, SEARCH_INDEXING: value }, production), value).toBe('site');
    }
  });

  it('under test (not a production build) it is off unless told otherwise', () => {
    expect(searchIndexing(LIVE)).toBe('off');
  });
});

describe('robotsHeaderFor', () => {
  const pages = ['/', '/austin', '/austin/furniture-assembly', '/austin/tasks', '/pricing', '/help/who-sees-my-address'];
  const listings = ['/tasks/assemble-a-desk-mueller-7f3k', '/helpers/jordan-t'];

  it('off: every page is noindex, nofollow', () => {
    for (const path of [...pages, ...listings, '/sign-in']) expect(robotsHeaderFor('off', path), path).toBe('noindex, nofollow');
  });

  it('site: the site pages are open, the listings are noindex (links still followed)', () => {
    for (const path of pages) expect(robotsHeaderFor('site', path), path).toBeNull();
    for (const path of listings) expect(robotsHeaderFor('site', path), path).toBe('noindex');
  });

  it('on: every public page is open', () => {
    for (const path of [...pages, ...listings]) expect(robotsHeaderFor('on', path), path).toBeNull();
  });

  it('signed-in and staff pages are never indexed, and a market merely named like them is', () => {
    for (const mode of ['off', 'site', 'on'] as const) {
      for (const path of ['/app', '/app/tasks/new', '/admin', '/admin/cases']) expect(robotsHeaderFor(mode, path), `${mode} ${path}`).toBe('noindex, nofollow');
    }
    expect(robotsHeaderFor('on', '/appleton')).toBeNull();
    expect(robotsHeaderFor('site', '/administration-district')).toBeNull();
  });
});
