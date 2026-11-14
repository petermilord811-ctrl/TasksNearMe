import { describe, expect, it } from 'vitest';
import { disallowedPaths, robotsFile } from './robots';

/** Google's robots.txt matching: a rule is a prefix where `*` is any run and a final `$` ends the URL. */
function ruleMatches(rule: string, url: string): boolean {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(url);
}

/** The longest matching rule wins; on a tie, Allow does. */
function crawlable(url: string, rules: { allow: string[]; disallow: string[] }): boolean {
  const longest = (list: string[]) => Math.max(-1, ...list.filter((rule) => ruleMatches(rule, url)).map((rule) => rule.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

describe('robotsFile', () => {
  it('asks every crawler to stay out while indexing is off, and names no sitemap', () => {
    expect(robotsFile({ indexing: false, baseUrl: 'https://tasksnearme.com' })).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('with indexing on, allows the site and points at the sitemap', () => {
    const file = robotsFile({ indexing: true, baseUrl: 'https://tasksnearme.com' });
    expect(file.sitemap).toBe('https://tasksnearme.com/sitemap.xml');
    expect(file.rules).toMatchObject({ userAgent: '*', allow: '/' });
  });

  const rules = { allow: ['/'], disallow: disallowedPaths() };

  it.each([
    '/',
    '/es',
    '/austin',
    '/austin/furniture-assembly',
    '/es/austin/tasks?category=moving-help',
    '/tasks/assemble-a-desk-mueller-7f3k',
    '/helpers/jordan-t',
    '/help/who-sees-my-address',
    '/pricing',
    '/sign-in',
    '/waitlist',
    '/app/tasks/new',
    '/sitemap.xml',
    '/_next/static/chunks/app.js',
    // Markets whose slugs only start like a closed section.
    '/devils-lake',
    '/administration-district',
    '/coderre',
  ])('%s stays crawlable', (url) => {
    expect(crawlable(url, rules)).toBe(true);
  });

  it.each([
    '/api/files/fil_123?w=640',
    '/api/auth/callback/google',
    '/admin',
    '/admin/cases',
    '/es/admin?tab=open',
    '/dev',
    '/dev/sign-in',
    '/es/dev/outbox',
    '/code',
    '/code?token=abc',
    '/es/code',
    '/email/unsubscribe?token=abc',
    '/es/email/unsubscribe',
    '/invite/ABC123',
    '/es/invite/ABC123',
  ])('%s is closed to crawlers', (url) => {
    expect(crawlable(url, rules)).toBe(false);
  });
});
