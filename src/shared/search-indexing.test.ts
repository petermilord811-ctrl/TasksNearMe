import { describe, expect, it } from 'vitest';
import { followsSearchSetting, LIVE_SITE_INDEXING, robotsHeaderFor, searchIndexing, storedSearchIndexing } from './search-indexing';

const LIVE = { APP_URL: 'https://tasksnearme.com' };
const production = { production: true };
const development = { production: false };

describe('searchIndexing', () => {
  it('the live site follows the committed default until an admin sets it: the site pages, not the listings (the owner, 2026-11-14)', () => {
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

describe('the admin setting (the config page, launch runbook J-L6)', () => {
  const e2e = { production: false, e2e: true };

  it('reads the stored flag: on when set, site when turned off, nothing when never set', () => {
    expect(storedSearchIndexing(true)).toBe('on');
    expect(storedSearchIndexing(false)).toBe('site');
    expect(storedSearchIndexing(undefined)).toBeNull();
  });

  it('the live site follows it: on opens the listings, site keeps them out, never set keeps the default', () => {
    expect(searchIndexing(LIVE, production, 'on')).toBe('on');
    expect(searchIndexing(LIVE, production, 'site')).toBe('site');
    expect(searchIndexing(LIVE, production, null)).toBe(LIVE_SITE_INDEXING);
  });

  it('no other copy of the app follows it, whatever its database says', () => {
    expect(searchIndexing(LIVE, development, 'on')).toBe('off');
    expect(searchIndexing({ APP_URL: 'https://dev.tasksnearme.com' }, production, 'on')).toBe('off');
    expect(searchIndexing({}, production, 'site')).toBe('off');
  });

  it('the e2e build follows it once a test sets it, and is off otherwise', () => {
    expect(searchIndexing({ APP_URL: 'http://localhost:3300' }, e2e, 'on')).toBe('on');
    expect(searchIndexing({ APP_URL: 'http://localhost:3300' }, e2e, 'site')).toBe('site');
    expect(searchIndexing({ APP_URL: 'http://localhost:3300' }, e2e, null)).toBe('off');
  });

  it('SEARCH_INDEXING still overrides it', () => {
    expect(searchIndexing({ ...LIVE, SEARCH_INDEXING: 'site' }, production, 'on')).toBe('site');
    expect(searchIndexing({ ...LIVE, SEARCH_INDEXING: 'off' }, production, 'on')).toBe('off');
  });

  it('is read only where it can change the mode', () => {
    expect(followsSearchSetting(LIVE, production)).toBe(true);
    expect(followsSearchSetting({ APP_URL: 'http://localhost:3300' }, e2e)).toBe(true);
    expect(followsSearchSetting(LIVE, development)).toBe(false);
    expect(followsSearchSetting({ ...LIVE, SEARCH_INDEXING: 'on' }, production)).toBe(false);
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
