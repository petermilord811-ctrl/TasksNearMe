import { describe, expect, it } from 'vitest';
import {
  CONTACT_REVERT_MS,
  checkContactRevertLink,
  contactRevertIdOf,
  contactRevertToken,
  contactRevertTokenMatches,
  contactRevertUrl,
  type ContactRevertClaim,
} from './contact-revert-token';

/**
 * The "Not you?" link in a contact change notice (completion plan 5.23): it names one change and is signed over
 * everything about it, so it can't be edited to point at another change, another account or a later expiry. It
 * works once, for 7 days.
 */

const changedAt = new Date('2026-11-14T10:00:00.000Z');
const claim: ContactRevertClaim = { id: 'ccr_0123456789abcdef0123456789abcdef', userId: 'usr_maya', kind: 'email', expiresAt: new Date(changedAt.getTime() + CONTACT_REVERT_MS) };
const KEY = 'test-secret';
const unused = { ...claim, usedAt: null };

describe('the Not you? link', () => {
  it('names its change and matches it', () => {
    const token = contactRevertToken(claim, KEY);
    expect(token).toMatch(/^ccr_[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    expect(contactRevertIdOf(token)).toBe(claim.id);
    expect(contactRevertTokenMatches(token, claim, KEY)).toBe(true);
    expect(checkContactRevertLink(token, unused, changedAt, KEY)).toEqual({ ok: true });
  });

  it('carries only the id and a signature, in an address that asks first', () => {
    const url = contactRevertUrl('https://tasksnearme.example', claim, KEY);
    expect(url).toBe(`https://tasksnearme.example/account/not-me?token=${encodeURIComponent(contactRevertToken(claim, KEY))}`);
    expect(url).not.toContain('usr_maya');
  });

  it('works for 7 days from the change, then never again', () => {
    const token = contactRevertToken(claim, KEY);
    expect(checkContactRevertLink(token, unused, new Date(claim.expiresAt.getTime() - 1), KEY)).toEqual({ ok: true });
    expect(checkContactRevertLink(token, unused, claim.expiresAt, KEY)).toEqual({ ok: false, reason: 'expired' });
    expect(checkContactRevertLink(token, unused, new Date(claim.expiresAt.getTime() + 86_400_000), KEY)).toEqual({ ok: false, reason: 'expired' });
  });

  it('works once', () => {
    const token = contactRevertToken(claim, KEY);
    expect(checkContactRevertLink(token, { ...claim, usedAt: new Date(changedAt.getTime() + 60_000) }, changedAt, KEY)).toEqual({ ok: false, reason: 'used' });
  });

  it('stops matching when anything it was signed for differs', () => {
    const token = contactRevertToken(claim, KEY);
    expect(contactRevertTokenMatches(token, { ...claim, userId: 'usr_chris' }, KEY)).toBe(false);
    expect(contactRevertTokenMatches(token, { ...claim, kind: 'phone' }, KEY)).toBe(false);
    expect(contactRevertTokenMatches(token, { ...claim, expiresAt: new Date('2026-12-21T10:00:00.000Z') }, KEY)).toBe(false);
    expect(contactRevertTokenMatches(token, { ...claim, id: 'ccr_ffffffffffffffffffffffffffffffff' }, KEY)).toBe(false);
    expect(contactRevertTokenMatches(token, claim, 'another-secret')).toBe(false);
  });

  it('says only "invalid" for a forged link, before looking at whether it was used or expired', () => {
    const token = contactRevertToken(claim, KEY);
    const [id, signature] = token.split('.') as [string, string];
    const flipped = `${id}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(checkContactRevertLink(flipped, unused, changedAt, KEY)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkContactRevertLink(flipped, { ...claim, usedAt: changedAt }, new Date('2027-01-01'), KEY)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkContactRevertLink(token, null, changedAt, KEY)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkContactRevertLink(contactRevertToken(claim, 'another-secret'), unused, changedAt, KEY)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an edited or malformed link without throwing', () => {
    const token = contactRevertToken(claim, KEY);
    const [id, signature] = token.split('.') as [string, string];
    const flipped = `${id}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(contactRevertTokenMatches(flipped, claim, KEY)).toBe(false);
    expect(contactRevertTokenMatches(`${id}.short`, claim, KEY)).toBe(false);
    expect(contactRevertTokenMatches('', claim, KEY)).toBe(false);
    for (const bad of [undefined, null, 42, '', 'nodot', `${id}.`, '.abc', `usr_maya.${signature}`, `${id}.${signature}.extra`, 'x'.repeat(500), `${id.toUpperCase()}.${signature}`]) {
      expect(contactRevertIdOf(bad)).toBeNull();
    }
  });
});
