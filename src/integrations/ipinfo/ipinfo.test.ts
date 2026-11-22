import { describe, expect, it, vi } from 'vitest';
import { createIpLookup } from './index';
import { addressKind, cachedIpLookup, documentationBlock, fetchIpinfo, ipinfoPageUrl, parseIpinfo, type IpLookupResult } from './ipinfo';

/** Answers as ipinfo.io sent them on 2026-11-21 (classic endpoint, no token) and as its docs show them (Lite, paid). */
const classic = { ip: '8.8.8.8', hostname: 'dns.google', city: 'Mountain View', region: 'California', country: 'US', loc: '38.0088,-122.1175', org: 'AS15169 Google LLC', postal: '94043', timezone: 'America/Los_Angeles', readme: 'https://ipinfo.io/missingauth', anycast: true };
const lite = { ip: '8.8.8.8', asn: 'AS15169', as_name: 'Google LLC', as_domain: 'google.com', country_code: 'US', country: 'United States', continent_code: 'NA', continent: 'North America' };
const paid = { ip: '8.8.8.8', hostname: 'dns.google', city: 'Mountain View', region: 'California', country: 'US', is_anonymous: false, is_hosting: true, asn: { asn: 'AS15169', name: 'Google LLC', domain: 'google.com', type: 'hosting' } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchReturning = (...responses: (Response | Error)[]) => {
  const fn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response);
    else fn.mockResolvedValueOnce(response);
  }
  return fn;
};

describe('addressKind', () => {
  it('sends only public addresses', () => {
    for (const ip of ['8.8.8.8', '9.9.9.9', '2001:4860:4860::8888', '::ffff:8.8.8.8', '172.32.0.1', '100.128.0.1']) expect(addressKind(ip), ip).toBe('public');
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '100.64.0.1', '169.254.1.1', '0.0.0.0', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) {
      expect(addressKind(ip), ip).toBe('reserved');
    }
    for (const ip of ['', 'localhost', '999.1.1.1', '1.2.3', '8.8.8.8/32', 'abc::xyz']) expect(addressKind(ip), ip).toBe('invalid');
  });

  it('names the documentation blocks for the stand-in', () => {
    expect([documentationBlock('192.0.2.9'), documentationBlock('198.51.100.9'), documentationBlock('203.0.113.9'), documentationBlock('2001:0DB8::9'), documentationBlock('8.8.8.8')]).toEqual(['test-net-1', 'test-net-2', 'test-net-3', 'ipv6', undefined]);
  });
});

describe('parseIpinfo', () => {
  it('reads the classic answer: country code, region, city, network and host name', () => {
    expect(parseIpinfo(classic)).toEqual({ status: 'found', location: { countryCode: 'US', region: 'California', city: 'Mountain View', network: 'AS15169 Google LLC', hostname: 'dns.google' } });
  });

  it('reads the Lite schema (country spelled out, code apart) and paid flags', () => {
    expect(parseIpinfo(lite)).toEqual({ status: 'found', location: { countryCode: 'US', network: 'AS15169 Google LLC' } });
    expect(parseIpinfo(paid)).toEqual({ status: 'found', location: { countryCode: 'US', region: 'California', city: 'Mountain View', network: 'AS15169 Google LLC', hostname: 'dns.google', hosting: true } });
    expect(parseIpinfo({ ip: '1.1.1.1', country: 'NL', privacy: { vpn: true, proxy: false, tor: false, relay: false, hosting: true } })).toEqual({ status: 'found', location: { countryCode: 'NL', anonymous: true, hosting: true } });
  });

  it('treats a bogon as private, and anything unreadable as a failure', () => {
    expect(parseIpinfo({ ip: '10.0.0.1', bogon: true })).toEqual({ status: 'private' });
    expect(parseIpinfo('nope')).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(parseIpinfo([classic])).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(parseIpinfo({ ip: '8.8.8.8', country: 'Narnia', city: '  ' })).toEqual({ status: 'found', location: {} });
  });
});

describe('fetchIpinfo', () => {
  it('asks the classic endpoint, with the token as a Bearer header when set', async () => {
    const fetchImpl = fetchReturning(json(classic), json(classic));
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchImpl })).toMatchObject({ status: 'found', location: { city: 'Mountain View' } });
    await fetchIpinfo('2001:4860:4860::8888', { fetch: fetchImpl, token: 'tok_123' });
    const [[firstUrl, firstInit], [secondUrl, secondInit]] = fetchImpl.mock.calls;
    expect(firstUrl).toBe('https://ipinfo.io/8.8.8.8/json');
    expect(new Headers(firstInit?.headers).get('authorization')).toBeNull();
    expect(secondUrl).toBe('https://ipinfo.io/2001:4860:4860::8888/json');
    expect(new Headers(secondInit?.headers).get('authorization')).toBe('Bearer tok_123');
    expect(ipinfoPageUrl('8.8.8.8')).toBe('https://ipinfo.io/8.8.8.8');
  });

  it('never sends a private or invalid address', async () => {
    const fetchImpl = fetchReturning();
    expect(await fetchIpinfo('192.168.0.10', { fetch: fetchImpl })).toEqual({ status: 'private' });
    expect(await fetchIpinfo('::1', { fetch: fetchImpl })).toEqual({ status: 'private' });
    expect(await fetchIpinfo('not-an-ip', { fetch: fetchImpl })).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports the free limit, errors and timeouts as unavailable', async () => {
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchReturning(json({ status: 429 }, 429)) })).toEqual({ status: 'unavailable', reason: 'limit' });
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchReturning(json({ status: 404, error: { title: 'Wrong ip' } }, 404)) })).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchReturning(new Response('<html>', { status: 200 })) })).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchReturning(new DOMException('The operation timed out.', 'TimeoutError')) })).toEqual({ status: 'unavailable', reason: 'failed' });
  });

  it('asks again without a token ipinfo.io refuses, and says so in the log', async () => {
    const warn = vi.fn();
    const fetchImpl = fetchReturning(json({ status: 403, error: { title: 'Unknown token' } }, 403), json(classic));
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchImpl, token: 'bad', warn })).toMatchObject({ status: 'found' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImpl.mock.calls[1]![1]?.headers).get('authorization')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('IPINFO_TOKEN'));
    // Without a token, a 403 is just a failure.
    expect(await fetchIpinfo('8.8.8.8', { fetch: fetchReturning(json({}, 403)) })).toEqual({ status: 'unavailable', reason: 'failed' });
  });
});

describe('cachedIpLookup', () => {
  const found: IpLookupResult = { status: 'found', location: { countryCode: 'US' } };

  it('reuses an answer for a day and shares one request among simultaneous asks', async () => {
    let clock = 0;
    const lookup = vi.fn(async () => found);
    const cached = cachedIpLookup(lookup, { now: () => clock });
    await Promise.all([cached('8.8.8.8'), cached(' 8.8.8.8 '), cached('8.8.8.8')]);
    clock += 23 * 3_600_000;
    await cached('8.8.8.8');
    expect(lookup).toHaveBeenCalledTimes(1);
    clock += 2 * 3_600_000;
    await cached('8.8.8.8');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('retries a failure after a minute and the free limit after ten', async () => {
    let clock = 0;
    const lookup = vi.fn<(ip: string) => Promise<IpLookupResult>>(async (ip) => (ip === '1.1.1.1' ? { status: 'unavailable', reason: 'failed' } : { status: 'unavailable', reason: 'limit' }));
    const cached = cachedIpLookup(lookup, { now: () => clock });
    await cached('1.1.1.1');
    await cached('9.9.9.9');
    clock += 61_000;
    await cached('1.1.1.1');
    await cached('9.9.9.9');
    expect(lookup.mock.calls.map(([ip]) => ip)).toEqual(['1.1.1.1', '9.9.9.9', '1.1.1.1']);
  });

  it('keeps a bounded number of addresses, dropping the oldest', async () => {
    const lookup = vi.fn<(ip: string) => Promise<IpLookupResult>>(async () => found);
    const cached = cachedIpLookup(lookup, { maxEntries: 2 });
    await cached('1.1.1.1');
    await cached('2.2.2.2');
    await cached('3.3.3.3');
    await cached('2.2.2.2');
    await cached('1.1.1.1');
    expect(lookup.mock.calls.map(([ip]) => ip)).toEqual(['1.1.1.1', '2.2.2.2', '3.3.3.3', '1.1.1.1']);
  });
});

describe('createIpLookup', () => {
  it('answers documentation addresses itself in development, and treats them as reserved in production', async () => {
    const fetchImpl = fetchReturning(json(classic));
    const dev = createIpLookup({ NODE_ENV: 'development' }, fetchImpl);
    expect(await dev('203.0.113.24')).toMatchObject({ status: 'found', location: { city: 'Gainesville', countryCode: 'US' } });
    expect(await dev('198.51.100.7')).toMatchObject({ status: 'found', location: { anonymous: true, hosting: true } });
    expect(await dev('192.0.2.1')).toEqual({ status: 'unavailable', reason: 'limit' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await dev('8.8.8.8')).toMatchObject({ status: 'found', location: { city: 'Mountain View' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const production = createIpLookup({ NODE_ENV: 'production', IPINFO_TOKEN: '  ' }, fetchReturning());
    expect(await production('203.0.113.24')).toEqual({ status: 'private' });
  });
});
