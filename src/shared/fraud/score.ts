import {
  fraudLevelOf,
  type AddressAutoCheck,
  type AddressCheckKey,
  type AdminIpLocation,
  type BackgroundAdjudication,
  type BackgroundCheckStatus,
  type CheckOutcome,
  type FraudFactor,
  type FraudFactorKey,
  type FraudScore,
  type IdCheckKey,
  type IdentityAutoCheck,
  type NetworkKind,
  type PayoutAccountStatus,
} from '@/contracts';
import { stateCodeOfSlug } from '@/shared/us-states';

/**
 * The fraud scores staff see (owner, 2026-11-27). Each is the sum of what was found, capped at 100: the points are
 * judgment, set so that one strong sign (a duplicate ID, a face that doesn't match, an edited statement, a Tor exit)
 * reaches "high" alone, a weaker one (a VPN, a data center, a sign-in from abroad) "medium", and ordinary things (a
 * phone network in another state, a new account) stay "low". The person's final score combines the areas
 * (`combineFraud`). Nothing here decides anything; staff do.
 */

export function scoreOf(factors: readonly FraudFactor[]): FraudScore {
  const kept = factors.filter((factor) => factor.points > 0).sort((a, b) => b.points - a.points);
  const score = Math.min(100, Math.round(kept.reduce((total, factor) => total + factor.points, 0)));
  return { score, level: fraudLevelOf(score), factors: kept };
}

const factor = (key: FraudFactorKey, points: number, count?: number): FraudFactor => ({ key, points, ...(count !== undefined ? { count } : {}) });

// ---------------------------------------------------------------------------------------------------------------
// Addresses

/**
 * Networks by number: cloud and hosting companies, VPN companies' own networks, and the relays that hide the address
 * (iCloud Private Relay leaves through Cloudflare, Akamai and Fastly; Cloudflare WARP too). Names catch the rest.
 */
const HOSTING_ASNS = new Set([
  16509, 14618, 8987, // Amazon
  15169, 396982, 19527, // Google, Google Cloud
  8075, 8068, // Microsoft
  14061, // DigitalOcean
  63949, // Akamai Connected Cloud (Linode)
  24940, 213230, // Hetzner
  16276, // OVH
  20473, // The Constant Company (Vultr)
  51167, // Contabo
  12876, // Scaleway
  31898, // Oracle Cloud
  45102, // Alibaba
  132203, // Tencent
  60781, 28753, 395954, 30633, // Leaseweb
  36352, // ColoCrossing
  46606, // Unified Layer
  26496, // GoDaddy
  8560, // IONOS
  47583, // Hostinger
  54825, // Equinix Metal
  19318, // Interserver
  29802, // Hivelocity
  8100, // QuadraNet
  53667, // FranTech
  49981, // WorldStream
  11878, // tzulo
  35916, // Multacom
  62240, // Clouvider
  40065, // CNSERVERS
]);
const VPN_ASNS = new Set([
  9009, // M247
  212238, 60068, // Datacamp (CDN77)
  39351, // 31173 Services (Mullvad)
  209854, // Surfshark
  136787, 147049, // NordVPN's networks (Tefincom, PacketHub)
]);
const RELAY_ASNS = new Set([13335, 36183, 54113]);
const MOBILE_ASNS = new Set([21928, 22394, 6167, 20057, 10507, 3651, 6614]);

const VPN_NAMES = ['vpn', 'proxy', 'nordvpn', 'tefincom', 'packethub', 'surfshark', 'expressvpn', 'mullvad', '31173 services', 'proton', 'private internet access', 'cyberghost', 'ipvanish', 'hide.me', 'windscribe', 'tunnelbear', 'm247', 'datacamp', 'cdn77'];
const RELAY_NAMES = ['cloudflare', 'akamai technologies', 'fastly', 'private relay'];
const HOSTING_NAMES = [
  'amazon', 'aws', 'google cloud', 'google llc', 'microsoft', 'azure', 'digitalocean', 'linode', 'akamai connected cloud', 'hetzner', 'ovh',
  'vultr', 'choopa', 'constant company', 'contabo', 'scaleway', 'oracle', 'alibaba', 'tencent', 'leaseweb', 'colocrossing', 'hostpapa',
  'godaddy', 'ionos', 'hostinger', 'unified layer', 'interserver', 'hivelocity', 'quadranet', 'frantech', 'buyvm', 'worldstream',
  'clouvider', 'tzulo', 'psychz', 'sharktech', 'zenlayer', 'hosting', 'datacenter', 'data center', 'dedicated', 'colocation', 'server', 'vps', 'cloud',
];
const MOBILE_NAMES = ['t-mobile', 'tmobile', 'verizon wireless', 'cellco', 'at&t mobility', 'sprint', 'us cellular', 'u.s. cellular', 'cricket', 'metropcs', 'boost mobile', 'wireless'];
const TOR_HOSTNAME = /(^|[.-])tor([.-]|$)|tor-?exit|torexit|exit-?node|anonymizer/i;

/** "AS15169 Google LLC" → 15169. */
function asnOf(network: string | undefined): number | undefined {
  const match = network?.match(/^AS(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

const named = (network: string, names: readonly string[]) => names.some((name) => network.includes(name));

/** What kind of network holds an address, from ipinfo.io's answer (its paid flags first, then the network's number and name). */
export function networkKindOf(location: AdminIpLocation): NetworkKind {
  const asn = asnOf(location.network);
  const name = (location.network ?? '').replace(/^AS\d+\s*/i, '').toLowerCase();
  if (location.hostname && TOR_HOSTNAME.test(location.hostname)) return 'tor';
  if (location.anonymous || (asn !== undefined && VPN_ASNS.has(asn)) || named(name, VPN_NAMES)) return 'vpn';
  if ((asn !== undefined && RELAY_ASNS.has(asn)) || (named(name, RELAY_NAMES) && !name.includes('connected cloud'))) return 'relay';
  if (location.hosting || (asn !== undefined && HOSTING_ASNS.has(asn)) || named(name, HOSTING_NAMES)) return 'hosting';
  if ((asn !== undefined && MOBILE_ASNS.has(asn)) || named(name, MOBILE_NAMES)) return 'mobile';
  return 'residential';
}

const NETWORK_POINTS: Partial<Record<NetworkKind, [FraudFactorKey, number]>> = {
  tor: ['ip_tor', 70],
  vpn: ['ip_vpn', 45],
  hosting: ['ip_hosting', 40],
  relay: ['ip_relay', 15],
};

/**
 * One address's score: what network holds it, where it is against the person's home city, and how many other
 * accounts used it (phone networks share addresses among many people, so that counts half there).
 */
export function ipFraud(input: { location: AdminIpLocation; otherAccounts: number; homeState?: string }): { network: NetworkKind; fraud: FraudScore } {
  const { location, otherAccounts } = input;
  const network = networkKindOf(location);
  const factors: FraudFactor[] = [];
  const kind = NETWORK_POINTS[network];
  if (kind) factors.push(factor(kind[0], kind[1]));
  if (location.countryCode && location.countryCode !== 'US') factors.push(factor('ip_outside_us', 30));
  else if (location.countryCode === 'US' && input.homeState && location.region) {
    const region = location.region.trim();
    const state = /^[a-z]{2}$/i.test(region) ? region.toUpperCase() : stateCodeOfSlug(region.toLowerCase().replace(/[^a-z]+/g, '-'));
    if (state && state !== input.homeState.toUpperCase()) factors.push(factor('ip_other_state', 10));
  }
  if (otherAccounts > 0) {
    const points = otherAccounts >= 4 ? 35 : otherAccounts >= 2 ? 20 : 10;
    factors.push(factor('ip_shared', network === 'mobile' ? Math.round(points / 2) : points, otherAccounts));
  }
  return { network, fraud: scoreOf(factors) };
}

/** The addresses' area: the riskiest address's score, with each finding counted across the addresses. */
export function ipsAreaFraud(scores: readonly FraudScore[]): FraudScore | null {
  if (scores.length === 0) return null;
  const top = scores.reduce((best, score) => (score.score > best.score ? score : best));
  const merged = new Map<FraudFactorKey, FraudFactor>();
  for (const score of scores) {
    for (const item of score.factors) {
      const seen = merged.get(item.key);
      // `ip_shared` already counts accounts; the others count the addresses with the finding.
      const count = item.key === 'ip_shared' ? Math.max(seen?.count ?? 0, item.count ?? 0) : (seen?.count ?? 0) + 1;
      merged.set(item.key, factor(item.key, Math.max(seen?.points ?? 0, item.points), count));
    }
  }
  const factors = [...merged.values()].sort((a, b) => b.points - a.points);
  return { score: top.score, level: top.level, factors };
}

// ---------------------------------------------------------------------------------------------------------------
// The ID

function idOutcome(check: IdentityAutoCheck, key: IdCheckKey): CheckOutcome | undefined {
  const found = check.checks?.find((item) => item.key === key)?.outcome;
  if (found) return found;
  // Readings before the ten checks (2026-11-27) kept answers only.
  const legacy: Partial<Record<IdCheckKey, boolean | undefined>> = { readable: check.readable, name: check.nameMatches, adult: check.isAdult, not_expired: check.notExpired, front_matches: check.frontAgrees };
  const answer = legacy[key];
  return answer === undefined ? undefined : answer ? 'pass' : 'fail';
}

const TAMPER_SIGNALS = new Set(['photo_edited', 'photo_of_screen', 'photocopy', 'selfie_is_id_photo', 'spoof_suspected']);

/**
 * An ID check's score, from its latest photos' checks: a fake or doubtful barcode, a front that disagrees with it, a
 * face that doesn't match or a selfie that isn't live, signs the photos were tampered with, the same ID on another
 * account, and earlier photos turned down. Null before anything was sent or read.
 */
export function identityFraud(input: { autoCheck?: IdentityAutoCheck; duplicate?: boolean; rejectedBefore?: number }): FraudScore | null {
  const { autoCheck } = input;
  const rejectedBefore = input.rejectedBefore ?? 0;
  if (!autoCheck && !input.duplicate && rejectedBefore === 0) return null;
  const factors: FraudFactor[] = [];
  if (autoCheck) {
    const is = (key: IdCheckKey, outcome: CheckOutcome) => idOutcome(autoCheck, key) === outcome;
    if (is('genuine', 'fail')) factors.push(factor('id_not_genuine', 50));
    else if (is('genuine', 'unsure')) factors.push(factor('id_barcode_doubtful', 15));
    if (is('front_matches', 'fail')) factors.push(factor('id_front_differs', 35));
    if (is('face_match', 'fail')) factors.push(factor('id_face_mismatch', 50));
    else if (is('face_match', 'unsure')) factors.push(factor('id_face_unsure', 15));
    if (is('live', 'fail')) factors.push(factor('id_not_live', 35));
    else if (is('live', 'unsure')) factors.push(factor('id_not_live', 10));
    const tampered = (autoCheck.signals ?? []).some((signal) => TAMPER_SIGNALS.has(signal));
    if (tampered) factors.push(factor('id_photo_tampered', is('face_match', 'fail') || is('live', 'fail') ? 15 : 35));
    if (is('name', 'fail')) factors.push(factor('id_name_differs', 20));
    else if (is('name', 'unsure')) factors.push(factor('id_name_differs', 5));
    if (is('adult', 'fail')) factors.push(factor('id_under_18', 25));
    if (is('not_expired', 'fail')) factors.push(factor('id_expired', 15));
    if (is('readable', 'fail') || is('machine_readable', 'fail')) factors.push(factor('id_unreadable', 15));
    else if (is('readable', 'unsure') || is('machine_readable', 'unsure')) factors.push(factor('id_unreadable', 5));
    if (is('unique', 'fail') && !input.duplicate) factors.push(factor('id_duplicate', 60));
  }
  if (input.duplicate) factors.push(factor('id_duplicate', 60));
  if (rejectedBefore > 0) factors.push(factor('id_rejected_before', Math.min(30, 10 * rejectedBefore), rejectedBefore));
  return scoreOf(factors);
}

// ---------------------------------------------------------------------------------------------------------------
// Proofs of address

function addressOutcome(check: AddressAutoCheck, key: AddressCheckKey): CheckOutcome | undefined {
  const found = check.checks?.find((item) => item.key === key)?.outcome;
  if (found) return found;
  const legacy: Partial<Record<AddressCheckKey, boolean | undefined>> = { readable: check.readable, name: check.nameMatches, address: check.addressMatches, recent: check.recent };
  const answer = legacy[key];
  return answer === undefined ? undefined : answer ? 'pass' : 'fail';
}

/** A proof of address's score: its latest reading (an edited statement above all), and earlier proofs turned down. */
export function addressFraud(input: { autoCheck?: AddressAutoCheck; rejectedBefore?: number }): FraudScore | null {
  const { autoCheck } = input;
  const rejectedBefore = input.rejectedBefore ?? 0;
  if (!autoCheck && rejectedBefore === 0) return null;
  const factors: FraudFactor[] = [];
  if (autoCheck) {
    const is = (key: AddressCheckKey, outcome: CheckOutcome) => addressOutcome(autoCheck, key) === outcome;
    if (is('unedited', 'fail')) factors.push(factor('address_edited', 50));
    else if (is('unedited', 'unsure')) factors.push(factor('address_edit_doubtful', 10));
    if (is('address', 'fail')) factors.push(factor('address_differs', 25));
    if (is('name', 'fail')) factors.push(factor('address_name_differs', 20));
    if (is('accepted_kind', 'fail')) factors.push(factor('address_not_accepted', 15));
    if (is('recent', 'fail')) factors.push(factor('address_old', 10));
    if (is('readable', 'fail')) factors.push(factor('address_unreadable', 10));
  }
  if (rejectedBefore > 0) factors.push(factor('address_rejected_before', Math.min(30, 10 * rejectedBefore), rejectedBefore));
  return scoreOf(factors);
}

// ---------------------------------------------------------------------------------------------------------------
// Payouts, the background check, the account

/** Null until payouts are set up (nothing to judge). */
export function payoutFraud(status: PayoutAccountStatus): FraudScore | null {
  if (status === 'restricted') return scoreOf([factor('payout_restricted', 40)]);
  if (status === 'requirements_due') return scoreOf([factor('payout_requirements_due', 10)]);
  if (status === 'active') return scoreOf([]);
  return null;
}

/** Null until a background check has a result. */
export function backgroundFraud(input: { status: BackgroundCheckStatus; adjudication?: BackgroundAdjudication }): FraudScore | null {
  if (input.adjudication === 'pre_adverse' || input.adjudication === 'post_adverse') return scoreOf([factor('background_adverse', 50)]);
  // A `consider` result our team approved reads as clear.
  if (input.status === 'clear' || input.adjudication === 'engaged') return scoreOf([]);
  if (input.status === 'consider' || input.status === 'suspended') return scoreOf([factor('background_consider', 30)]);
  return null;
}

const DAY_MS = 86_400_000;

export function accountFraud(input: {
  createdAt: Date;
  now: Date;
  status?: 'active' | 'suspended' | 'banned';
  contactHold?: boolean;
  strikes?: number;
  phoneVerified?: boolean;
  /** Different addresses in the last 30 days. */
  recentIps?: number;
}): FraudScore {
  const factors: FraudFactor[] = [];
  if (input.now.getTime() - input.createdAt.getTime() < 2 * DAY_MS) factors.push(factor('account_new', 10));
  if (input.status === 'suspended' || input.status === 'banned') factors.push(factor('account_suspended', 40));
  if (input.contactHold) factors.push(factor('account_contact_hold', 30));
  if (input.strikes) factors.push(factor('account_strikes', Math.min(30, 10 * input.strikes), input.strikes));
  if ((input.recentIps ?? 0) > 15) factors.push(factor('account_many_ips', 10, input.recentIps));
  if (input.phoneVerified === false) factors.push(factor('phone_unverified', 5));
  return scoreOf(factors);
}

/**
 * The person's final score from the areas that have one: independent warning signs add up the way chances do,
 * 100 × (1 − Π(1 − area/100)), so two "medium" areas make a "high" person while a clean area never lowers another.
 */
export function combineFraud(areas: readonly (FraudScore | null)[]): FraudScore {
  const scored = areas.filter((area): area is FraudScore => area !== null);
  const clean = scored.reduce((chance, area) => chance * (1 - Math.min(100, area.score) / 100), 1);
  const score = Math.min(100, Math.round(100 * (1 - clean)));
  const factors = scored.flatMap((area) => area.factors).sort((a, b) => b.points - a.points);
  return { score, level: fraudLevelOf(score), factors };
}
