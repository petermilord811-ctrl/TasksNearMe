import 'server-only';
import { isIP } from 'node:net';

/**
 * Where an IP address is, from ipinfo.io, for staff (the person page's sign-ins). One GET per address to
 * `https://ipinfo.io/{ip}/json`, the classic endpoint: without a token it answers with city, region, country,
 * network and time zone under an unpublished free limit (checked 2026-11-21); with `IPINFO_TOKEN` it answers within
 * that token's plan (a paid plan adds VPN and data-center flags). The Lite API (`api.ipinfo.io/lite`) refuses
 * requests without a token and has no city, so it isn't used. Private and reserved addresses never leave the server,
 * and answers stay in this process's memory only (`cachedIpLookup`): nothing is stored.
 */

export interface IpLocation {
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode?: string;
  region?: string;
  city?: string;
  /** The network holding the address, e.g. "AS15169 Google LLC". */
  network?: string;
  /** The address's reverse DNS name, when ipinfo.io has one. */
  hostname?: string;
  /** Paid plans: a VPN, proxy, Tor exit or relay. */
  anonymous?: boolean;
  /** Paid plans: a data center or cloud host. */
  hosting?: boolean;
}

export type IpLookupResult =
  | { status: 'found'; location: IpLocation }
  | { status: 'private' }
  | { status: 'unavailable'; reason: 'limit' | 'failed' };

export type IpLookup = (ip: string) => Promise<IpLookupResult>;

const ORIGIN = 'https://ipinfo.io';

/** ipinfo.io's own page for an address (everything it knows), for staff to open. */
export function ipinfoPageUrl(ip: string): string {
  return `${ORIGIN}/${ip}`;
}

function v4Number(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null;
  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

/** Special-purpose IPv4 blocks (RFC 6890): ipinfo.io answers "bogon" for these, so they're never sent. */
const V4_RESERVED: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function inV4Block(address: number, [network, prefix]: readonly [string, number]): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) === Math.floor(v4Number(network)! / size);
}

/** An IPv6 address as its eight 16-bit groups (an IPv4 tail becomes the last two), or null when it isn't one. */
function v6Groups(ip: string): number[] | null {
  let address = ip.toLowerCase().split('%')[0]!;
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = v4Number(tail);
    if (v4 === null) return null;
    address = `${address.slice(0, lastColon + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

/** Whether ipinfo.io can know anything about the address: a public one, a private or reserved one, or not an address. */
export function addressKind(ip: string): 'public' | 'reserved' | 'invalid' {
  const version = isIP(ip);
  if (version === 4) {
    const address = v4Number(ip)!;
    return V4_RESERVED.some((block) => inV4Block(address, block)) ? 'reserved' : 'public';
  }
  if (version !== 6) return 'invalid';
  const g = v6Groups(ip);
  if (!g) return 'invalid';
  const zeros = (count: number) => g.slice(0, count).every((group) => group === 0);
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4.
  if (zeros(5) && g[5] === 0xffff) return addressKind(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  if (zeros(7) && (g[7] === 0 || g[7] === 1)) return 'reserved'; // :: and ::1
  if ((g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xff00) === 0xff00) return 'reserved'; // unique local, link-local, multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'reserved'; // documentation (RFC 3849)
  return 'public';
}

/**
 * The documentation block an address is in (RFC 5737's three IPv4 blocks, RFC 3849's IPv6 one), which no real
 * person has: development's stand-in answers for these (index.ts).
 */
export function documentationBlock(ip: string): 'test-net-1' | 'test-net-2' | 'test-net-3' | 'ipv6' | undefined {
  if (isIP(ip) === 4) {
    const address = v4Number(ip)!;
    if (inV4Block(address, ['192.0.2.0', 24])) return 'test-net-1';
    if (inV4Block(address, ['198.51.100.0', 24])) return 'test-net-2';
    if (inV4Block(address, ['203.0.113.0', 24])) return 'test-net-3';
    return undefined;
  }
  const g = isIP(ip) === 6 ? v6Groups(ip) : null;
  return g && g[0] === 0x2001 && g[1] === 0x0db8 ? 'ipv6' : undefined;
}

const text = (value: unknown, max = 120): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : undefined);
const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);
const joined = (...parts: (string | undefined)[]): string | undefined => parts.filter(Boolean).join(' ') || undefined;

/**
 * Reads one answer. The classic schema gives the country as a code (`country: "US"`) and the network as
 * `org: "AS15169 Google LLC"`; paid plans add an `asn` object and `is_anonymous` / `is_hosting` (older ones a
 * `privacy` object); the Lite schema spells the country out and puts the code in `country_code`, with `asn` and
 * `as_name` as text. A bogon answer means a private or reserved address.
 */
export function parseIpinfo(body: unknown): IpLookupResult {
  const data = record(body);
  if (!data) return { status: 'unavailable', reason: 'failed' };
  if (data.bogon === true) return { status: 'private' };
  const code = text(data.country_code) ?? text(data.country);
  const countryCode = code && /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : undefined;
  const asn = record(data.asn);
  const network = text(data.org) ?? (asn ? joined(text(asn.asn), text(asn.name)) : joined(text(data.asn), text(data.as_name)));
  const privacy = record(data.privacy);
  const anonymous = data.is_anonymous === true || [privacy?.vpn, privacy?.proxy, privacy?.tor, privacy?.relay].some((flag) => flag === true);
  const hosting = data.is_hosting === true || privacy?.hosting === true;
  const region = text(data.region);
  const city = text(data.city);
  const hostname = text(data.hostname, 255);
  return {
    status: 'found',
    location: {
      ...(countryCode ? { countryCode } : {}),
      ...(region ? { region } : {}),
      ...(city ? { city } : {}),
      ...(network ? { network } : {}),
      ...(hostname ? { hostname } : {}),
      ...(anonymous ? { anonymous } : {}),
      ...(hosting ? { hosting } : {}),
    },
  };
}

export interface IpinfoOptions {
  /** `IPINFO_TOKEN`, sent as a Bearer token. */
  token?: string;
  fetch?: typeof fetch;
  /** Per request; the person page waits for the answers. */
  timeoutMs?: number;
  warn?: (message: string) => void;
}

/** Asks ipinfo.io about one address. Never throws: a refusal, an error or a timeout is `unavailable`. */
export async function fetchIpinfo(ip: string, options: IpinfoOptions = {}): Promise<IpLookupResult> {
  const kind = addressKind(ip);
  if (kind === 'invalid') return { status: 'unavailable', reason: 'failed' };
  if (kind === 'reserved') return { status: 'private' };
  const request = (token: string | undefined) =>
    (options.fetch ?? fetch)(`${ORIGIN}/${ip}/json`, {
      headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    });
  try {
    let response = await request(options.token);
    if ((response.status === 401 || response.status === 403) && options.token) {
      // A token the plan doesn't cover here (or a mistyped one) shouldn't take the lookups away: ask without it.
      (options.warn ?? console.warn)(`[ipinfo] ipinfo.io refused IPINFO_TOKEN (HTTP ${response.status}); looking up without it.`);
      response = await request(undefined);
    }
    if (response.status === 429) return { status: 'unavailable', reason: 'limit' };
    if (!response.ok) return { status: 'unavailable', reason: 'failed' };
    return parseIpinfo(await response.json());
  } catch {
    return { status: 'unavailable', reason: 'failed' };
  }
}

const MINUTE = 60_000;
/** How long an answer is reused: places barely change, a refusal is retried soon. */
const KEEP_MS = { found: 24 * 60 * MINUTE, private: 24 * 60 * MINUTE, limit: 10 * MINUTE, failed: MINUTE } as const;

/**
 * Keeps answers in this process's memory (up to `maxEntries` addresses, the oldest dropped first), and shares one
 * request among simultaneous asks for the same address.
 */
export function cachedIpLookup(lookup: IpLookup, options: { now?: () => number; maxEntries?: number } = {}): IpLookup {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 500;
  const entries = new Map<string, { expiresAt: number; result: Promise<IpLookupResult> }>();
  return (raw) => {
    const ip = raw.trim();
    const key = ip.toLowerCase();
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) return hit.result;
    entries.delete(key);
    const entry = { expiresAt: Number.POSITIVE_INFINITY, result: lookup(ip) };
    entries.set(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    entry.result.then(
      (answer) => {
        entry.expiresAt = now() + (answer.status === 'unavailable' ? KEEP_MS[answer.reason] : KEEP_MS[answer.status]);
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return entry.result;
  };
}
