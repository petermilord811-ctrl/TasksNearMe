import type { BetaRole, InviteCodeStatus } from '@/contracts';

/**
 * Private beta rules (blueprint 11 B-068, 10 §6), as pure functions. Two switches per market, both off by
 * default (decisions.md, 2026-11-13):
 * - `beta.sign_up`: a new account needs an invite (any role) to finish signing up.
 * - `beta.helpers`: becoming a helper needs a helper invite.
 * People who finished signing up, or started helper setup, before a switch went on keep going.
 */

export const BETA_FLAGS = { signUp: 'beta.sign_up', helpers: 'beta.helpers' } as const;

export interface BetaGates {
  signUp: boolean;
  helpers: boolean;
}

/** The market's switches from its flags; `forced` (a development or test browser) turns both on. */
export function betaGatesFrom(flags: Record<string, boolean>, forced = false): BetaGates {
  return { signUp: forced || flags[BETA_FLAGS.signUp] === true, helpers: forced || flags[BETA_FLAGS.helpers] === true };
}

/** Finishing sign-up waits for an invite: the switch is on and the person has no access in the market yet. */
export function signUpNeedsInvite(gates: BetaGates, grants: readonly BetaRole[]): boolean {
  return gates.signUp && grants.length === 0;
}

/** Starting helper setup waits for a helper invite (people who already started keep going). */
export function helperSetupNeedsInvite(gates: BetaGates, grants: readonly BetaRole[], startedHelperSetup: boolean): boolean {
  return gates.helpers && !startedHelperSetup && !grants.includes('helper');
}

export interface InviteCodeFacts {
  maxUses: number;
  uses: number;
  expiresAt: string | Date | null;
  revokedAt: string | Date | null;
}

export function inviteCodeStatus(code: InviteCodeFacts, now: Date): InviteCodeStatus {
  if (code.revokedAt) return 'revoked';
  if (code.expiresAt && new Date(code.expiresAt) <= now) return 'expired';
  if (code.uses >= code.maxUses) return 'used_up';
  return 'active';
}

/** Where a code may be used: any code finishes sign-up; only a helper code starts helper setup. */
export type InviteUse = 'sign_up' | 'helper_setup';

export function codeFitsUse(role: BetaRole, use: InviteUse): boolean {
  return use === 'sign_up' || role === 'helper';
}

/** Letters and digits people can't mix up when reading a code aloud (no 0/O, 1/I/L). */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GENERATED_CODE_LENGTH = 8;

/** What people type, as stored: upper case, without spaces or dashes ("k7qp-m4xd" → "K7QPM4XD"). */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

/** Generated codes read in two groups of four ("K7QP-M4XD"); staff's own codes read as they are. */
export function displayInviteCode(code: string): string {
  return code.length === GENERATED_CODE_LENGTH && [...code].every((c) => INVITE_CODE_ALPHABET.includes(c)) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** A random code from `bytes` (crypto.getRandomValues in production; fixed values in tests). */
export function generateInviteCode(bytes: Uint8Array): string {
  // 31 symbols: rejection sampling keeps every symbol equally likely (248 = 8 × 31).
  let out = '';
  for (const byte of bytes) {
    if (byte >= 248) continue;
    out += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
    if (out.length === GENERATED_CODE_LENGTH) return out;
  }
  throw new Error('Not enough random bytes for an invite code');
}

/** Staff who make and withdraw invites (support leads and admins); every other staff role reads. */
export function canManageBeta(roles: readonly string[]): boolean {
  return roles.includes('admin') || roles.includes('support_lead');
}

/** The invite-only switches are feature flags, which only admins change (blueprint 08's access matrix). */
export function canSwitchBeta(roles: readonly string[]): boolean {
  return roles.includes('admin');
}
