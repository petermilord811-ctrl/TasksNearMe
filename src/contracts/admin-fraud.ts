import type { AdminIpLookup } from './admin-people';
import type { ISODateTime } from './common';

/**
 * Fraud scores for staff (owner, 2026-11-27: "for signed-in ips, you should show fraud score about that ips with
 * ipinfo.io (show all detected ips)", "show fraud score to me" for ID checks, "By all that scores, finalized the user's
 * fraud score"). Every score is 0 to 100, higher is riskier, with the reasons behind it. They're estimates that point
 * staff at what to look at; nothing is decided by them.
 */

/** `low` under 30, `medium` under 60, `high` from 60 (`fraudLevelOf`). */
export const FRAUD_LEVELS = ['low', 'medium', 'high'] as const;
export type FraudLevel = (typeof FRAUD_LEVELS)[number];

export function fraudLevelOf(score: number): FraudLevel {
  return score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
}

/** Why a score is what it is; staff read each in words. */
export const FRAUD_FACTORS = [
  // An address (ipinfo.io's answer, and what we've seen on it).
  'ip_tor',
  'ip_vpn',
  'ip_relay',
  'ip_hosting',
  'ip_outside_us',
  'ip_other_state',
  'ip_shared',
  // The ID check: its ten checks and what was found.
  'id_not_genuine',
  'id_barcode_doubtful',
  'id_front_differs',
  'id_face_mismatch',
  'id_face_unsure',
  'id_not_live',
  'id_photo_tampered',
  'id_duplicate',
  'id_name_differs',
  'id_expired',
  'id_under_18',
  'id_unreadable',
  'id_rejected_before',
  // Proofs of address.
  'address_edited',
  'address_edit_doubtful',
  'address_name_differs',
  'address_differs',
  'address_old',
  'address_not_accepted',
  'address_unreadable',
  'address_rejected_before',
  // Payouts and the background check.
  'payout_restricted',
  'payout_requirements_due',
  'background_consider',
  'background_adverse',
  // The account.
  'account_new',
  'account_contact_hold',
  'account_suspended',
  'account_strikes',
  'account_many_ips',
  'phone_unverified',
] as const;
export type FraudFactorKey = (typeof FRAUD_FACTORS)[number];

export interface FraudFactor {
  key: FraudFactorKey;
  /** How much it adds (before the score is capped at 100). */
  points: number;
  /** How many: other accounts on an address, earlier rejections, strikes, addresses with this finding. */
  count?: number;
}

export interface FraudScore {
  score: number;
  level: FraudLevel;
  /** Biggest first; empty for a clean score. */
  factors: FraudFactor[];
}

/** What kind of network holds an address, from ipinfo.io's answer (its paid flags when the token has them). */
export const NETWORK_KINDS = ['tor', 'vpn', 'relay', 'hosting', 'mobile', 'residential'] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

/** Where an address was seen: a sign-in, accepting an agreement, or another action in the audit log. */
export const IP_SOURCES = ['sign_in', 'agreement', 'activity'] as const;
export type IpSource = (typeof IP_SOURCES)[number];

export const SIGN_IN_WAYS = ['email_code', 'phone_code', 'google', 'microsoft', 'passkey', 'other'] as const;
export type SignInWay = (typeof SIGN_IN_WAYS)[number];

/** One address the person used, with ipinfo.io's answer and its fraud score. */
export interface AdminDetectedIp {
  ip: string;
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
  seenIn: IpSource[];
  /** Sign-ins from it (kept a year). */
  signIns: number;
  /** The account was made from it. */
  signUp?: boolean;
  /** A browser is signed in from it now. */
  active?: boolean;
  /** The latest browser seen on it, named from its user agent, and how it signed in. */
  device?: { browser?: string; os?: string };
  userAgent?: string;
  way?: SignInWay;
  /** ipinfo.io's answer (absent past the newest 20 addresses: not looked up). */
  lookup?: AdminIpLookup;
  ipinfoUrl?: string;
  network?: NetworkKind;
  /** Other accounts seen on the same address. */
  otherAccounts: number;
  /** Absent when it couldn't be judged (a private address, or no answer from ipinfo.io). */
  fraud?: FraudScore;
}

/** The parts of a person's fraud score. */
export const FRAUD_AREAS = ['ips', 'identity', 'address', 'payout', 'background', 'account'] as const;
export type FraudArea = (typeof FRAUD_AREAS)[number];

export interface AdminFraudArea {
  area: FraudArea;
  /** Null: nothing to judge yet (no ID sent, payouts not set up, no address looked up…). */
  fraud: FraudScore | null;
}

/**
 * The person's fraud score: each area's score, and the final one combining them (independent warning signs add up:
 * 100 × (1 − Π(1 − area/100))).
 */
export interface AdminFraudView {
  fraud: FraudScore;
  areas: AdminFraudArea[];
  /** Every address seen, newest first (up to 50). */
  ips: AdminDetectedIp[];
  /** All the addresses seen, when there are more than shown. */
  ipsTotal: number;
}
