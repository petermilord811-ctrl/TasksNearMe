import 'server-only';
import { devHelpersOn } from '@/shared/dev-helpers';
import { cachedIpLookup, documentationBlock, fetchIpinfo, type IpLookup, type IpLookupResult } from './ipinfo';

export { addressKind, ipinfoPageUrl } from './ipinfo';
export type { IpLocation, IpLookup, IpLookupResult } from './ipinfo';

/**
 * IP address lookups for staff (ipinfo.io, `./ipinfo.ts`; blueprint 07 §2). No key needed: `IPINFO_TOKEN` is
 * optional and only raises the limit or, on a paid plan, adds the VPN and data-center flags.
 *
 * Development and the e2e build answer the documentation addresses themselves (RFC 5737 and 3849: no real person
 * has one), so screens and tests show each kind of answer without calling ipinfo.io. Production treats those as
 * reserved, like ipinfo.io does. Every other address is looked up for real everywhere.
 */
const STAND_IN: Record<NonNullable<ReturnType<typeof documentationBlock>>, IpLookupResult> = {
  'test-net-1': { status: 'unavailable', reason: 'limit' },
  'test-net-2': {
    status: 'found',
    location: { countryCode: 'DE', region: 'Hesse', city: 'Frankfurt am Main', network: 'AS9009 M247 Europe SRL', anonymous: true, hosting: true },
  },
  'test-net-3': {
    status: 'found',
    location: { countryCode: 'US', region: 'Florida', city: 'Gainesville', network: 'AS7922 Comcast Cable Communications, LLC' },
  },
  ipv6: { status: 'found', location: { countryCode: 'US', region: 'Texas', city: 'Austin', network: 'AS11427 Charter Communications Inc' } },
};

type Env = Record<string, string | undefined>;

export function createIpLookup(env: Env = process.env, fetchImpl?: typeof fetch): IpLookup {
  const token = env.IPINFO_TOKEN?.trim() || undefined;
  const real = cachedIpLookup((ip) => fetchIpinfo(ip, { token, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));
  if (!devHelpersOn(env)) return real;
  return async (ip) => {
    const block = documentationBlock(ip.trim());
    return block ? STAND_IN[block] : real(ip);
  };
}

let shared: IpLookup | undefined;

/** The app's lookup, one per process so its memory of answers is shared by every request. */
export function ipLookup(): IpLookup {
  shared ??= createIpLookup();
  return shared;
}
