import { describe, expect, it } from 'vitest';
import { summarizeUserAgent } from './user-agent';

describe('summarizeUserAgent', () => {
  it('names common browsers and systems', () => {
    const cases: [string, { browser?: string; os?: string }][] = [
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1', { browser: 'Safari', os: 'iPhone' }],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1', { browser: 'Chrome', os: 'iPhone' }],
      ['Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15', { browser: 'Firefox', os: 'iPad' }],
      ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36', { browser: 'Chrome', os: 'Android' }],
      ['Mozilla/5.0 (Linux; Android 15; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', { browser: 'Samsung Internet', os: 'Android' }],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0', { browser: 'Edge', os: 'Windows' }],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/125.0.0.0', { browser: 'Opera', os: 'Windows' }],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0', { browser: 'Firefox', os: 'Mac' }],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15', { browser: 'Safari', os: 'Mac' }],
      ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', { browser: 'Chrome', os: 'ChromeOS' }],
      ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36', { browser: 'Headless Chrome', os: 'Linux' }],
    ];
    for (const [agent, expected] of cases) expect(summarizeUserAgent(agent), agent).toEqual(expected);
  });

  it('leaves what it can’t name unnamed', () => {
    expect(summarizeUserAgent('curl/8.5.0')).toEqual({});
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/390.0')).toEqual({ os: 'iPhone' });
    expect(summarizeUserAgent(null)).toEqual({});
    expect(summarizeUserAgent(undefined)).toEqual({});
  });
});
