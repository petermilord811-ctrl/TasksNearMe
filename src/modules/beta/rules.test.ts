import { describe, expect, it } from 'vitest';
import {
  BETA_FLAGS,
  betaGatesFrom,
  canManageBeta,
  canSwitchBeta,
  clientNeedsInvite,
  codeFitsUse,
  displayInviteCode,
  generateInviteCode,
  helperSetupNeedsInvite,
  INVITE_CODE_ALPHABET,
  inviteCodeStatus,
  normalizeInviteCode,
  signUpNeedsInvite,
} from './rules';

const now = new Date('2026-11-20T18:00:00.000Z');
const live = { maxUses: 10, uses: 3, expiresAt: null, revokedAt: null };

describe('beta switches', () => {
  it('are off unless the market turns them on, and a test browser can force both', () => {
    expect(betaGatesFrom({})).toEqual({ signUp: false, helpers: false });
    expect(betaGatesFrom({ [BETA_FLAGS.signUp]: true })).toEqual({ signUp: true, helpers: false });
    expect(betaGatesFrom({ [BETA_FLAGS.helpers]: true })).toEqual({ signUp: false, helpers: true });
    expect(betaGatesFrom({}, true)).toEqual({ signUp: true, helpers: true });
  });

  it('hold sign-up for people without any access, whichever invite they used', () => {
    const on = { signUp: true, helpers: false };
    expect(signUpNeedsInvite(on, [])).toBe(true);
    expect(signUpNeedsInvite(on, ['poster'])).toBe(false);
    expect(signUpNeedsInvite(on, ['helper'])).toBe(false);
    expect(signUpNeedsInvite({ signUp: false, helpers: true }, [])).toBe(false);
  });

  it('hold helper setup for people without a helper invite who haven’t started it', () => {
    const on = { signUp: false, helpers: true };
    expect(helperSetupNeedsInvite(on, [], false)).toBe(true);
    expect(helperSetupNeedsInvite(on, ['poster'], false)).toBe(true);
    expect(helperSetupNeedsInvite(on, ['helper'], false)).toBe(false);
    // Started before the switch went on: carry on.
    expect(helperSetupNeedsInvite(on, [], true)).toBe(false);
    expect(helperSetupNeedsInvite({ signUp: true, helpers: false }, [], false)).toBe(false);
  });
});

describe('invite codes', () => {
  it('are active until withdrawn, expired or used up (withdrawn wins)', () => {
    expect(inviteCodeStatus(live, now)).toBe('active');
    expect(inviteCodeStatus({ ...live, uses: 10 }, now)).toBe('used_up');
    expect(inviteCodeStatus({ ...live, expiresAt: '2026-11-20T18:00:00.000Z' }, now)).toBe('expired');
    expect(inviteCodeStatus({ ...live, expiresAt: new Date('2026-11-21T00:00:00.000Z') }, now)).toBe('active');
    expect(inviteCodeStatus({ ...live, uses: 10, expiresAt: '2026-11-01T00:00:00.000Z', revokedAt: '2026-11-02T00:00:00.000Z' }, now)).toBe('revoked');
  });

  it('let any invite finish sign-up, but only a helper invite start helper setup', () => {
    expect(codeFitsUse('poster', 'sign_up')).toBe(true);
    expect(codeFitsUse('helper', 'sign_up')).toBe(true);
    expect(codeFitsUse('helper', 'helper_setup')).toBe(true);
    expect(codeFitsUse('poster', 'helper_setup')).toBe(false);
  });

  it('let only a client invite open booking help in a market opening soon (J-V8)', () => {
    expect(codeFitsUse('poster', 'client')).toBe(true);
    expect(codeFitsUse('helper', 'client')).toBe(false);
  });

  it('hold clients back in a market opening soon until they have a client invite, never in a live one, never staff (J-V8)', () => {
    expect(clientNeedsInvite('prelaunch', [], false)).toBe(true);
    // A helper invite doesn't open booking help.
    expect(clientNeedsInvite('prelaunch', ['helper'], false)).toBe(true);
    expect(clientNeedsInvite('prelaunch', ['poster'], false)).toBe(false);
    expect(clientNeedsInvite('prelaunch', [], true)).toBe(false);
    // Going live opens it to everyone, with no other change.
    expect(clientNeedsInvite('live', [], false)).toBe(false);
  });

  it('match however people type them', () => {
    expect(normalizeInviteCode(' k7qp-m4xd ')).toBe('K7QPM4XD');
    expect(normalizeInviteCode('Mueller Neighbors')).toBe('MUELLERNEIGHBORS');
  });

  it('show generated codes in two groups of four, and staff codes as they are', () => {
    expect(displayInviteCode('K7QPM4XD')).toBe('K7QP-M4XD');
    // L and 1 are never generated, so this one is a staff code.
    expect(displayInviteCode('MUELLER1')).toBe('MUELLER1');
    // Eight readable letters look generated; the dash is ignored when matching anyway.
    expect(displayInviteCode('HYDEPARK')).toBe('HYDE-PARK');
    expect(displayInviteCode('MUELLERNEIGHBORS')).toBe('MUELLERNEIGHBORS');
  });

  it('are generated from the readable alphabet, evenly', () => {
    const code = generateInviteCode(Uint8Array.from({ length: 32 }, (_, i) => i * 7));
    expect(code).toHaveLength(8);
    expect([...code].every((c) => INVITE_CODE_ALPHABET.includes(c))).toBe(true);
    // Bytes 248–255 would favor the first symbols, so they're skipped.
    expect(generateInviteCode(Uint8Array.from([255, 250, 248, 0, 1, 2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
    expect(() => generateInviteCode(new Uint8Array(4))).toThrow();
  });
});

describe('who manages the beta', () => {
  it('is support leads and admins', () => {
    expect(canManageBeta(['admin'])).toBe(true);
    expect(canManageBeta(['support_lead'])).toBe(true);
    expect(canManageBeta(['support_agent', 'finance'])).toBe(false);
    expect(canManageBeta(['trust_safety'])).toBe(false);
  });

  it('leaves the switches (feature flags) to admins', () => {
    expect(canSwitchBeta(['admin'])).toBe(true);
    expect(canSwitchBeta(['support_lead'])).toBe(false);
  });
});
