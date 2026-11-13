import { describe, expect, it } from 'vitest';
import {
  addressDocumentDue,
  addressStanding,
  backgroundNoticeDue,
  backgroundStanding,
  identitySessionIsStale,
  identityStanding,
  namesMatch,
  type AddressRow,
  type BackgroundRow,
  type IdentityRow,
} from './standing';

const DAY = 86_400_000;
const now = new Date('2026-11-20T18:00:00.000Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);

let seq = 0;
function idRow(over: Partial<IdentityRow>): IdentityRow {
  seq += 1;
  const createdAt = over.createdAt ?? ago(10 - seq * 0.01);
  return {
    id: `idv_${seq}`,
    status: 'processing',
    providerSessionId: `vs_${seq}`,
    failureReason: null,
    isAdult: null,
    nameMatches: null,
    nameConfirmedAt: null,
    verifiedAt: null,
    requestedReason: null,
    createdAt,
    updatedAt: createdAt,
    ...over,
  };
}
const failed = (createdAt: Date, reason = 'document_unreadable') => idRow({ status: 'requires_input', failureReason: reason, createdAt });

describe('identity standing', () => {
  it('starts not started, with a check to start', () => {
    expect(identityStanding([], now)).toMatchObject({ status: 'not_started', verified: false, cleared: false, attempts: 0, canStart: true });
  });

  it('clears a verified check whose name matched, and holds one whose name did not until staff confirm', () => {
    const matched = idRow({ status: 'verified', verifiedAt: ago(1), nameMatches: true, createdAt: ago(1) });
    expect(identityStanding([matched], now)).toMatchObject({ status: 'verified', cleared: true, canStart: false });
    const differs = idRow({ status: 'verified', verifiedAt: ago(1), nameMatches: false, createdAt: ago(1) });
    expect(identityStanding([differs], now)).toMatchObject({ status: 'verified', verified: true, cleared: false, nameCheck: 'in_review', reviewSince: ago(1) });
    const confirmed = { ...differs, nameConfirmedAt: now };
    expect(identityStanding([confirmed], now)).toMatchObject({ cleared: true });
    expect(identityStanding([confirmed], now).nameCheck).toBeUndefined();
  });

  it('allows 3 tries in 24 hours and says when the next one opens', () => {
    const rows = [failed(ago(0.9)), failed(ago(0.5)), failed(ago(0.1))];
    const standing = identityStanding(rows, now);
    expect(standing).toMatchObject({ blocked: 'try_later', canStart: false, attempts: 3, failureReason: 'document_unreadable' });
    expect(standing.retryAt).toEqual(new Date(rows[0]!.createdAt.getTime() + DAY));
  });

  it('sends 5 tries without a pass to staff, and a staff reset allows new tries', () => {
    const rows = [failed(ago(5)), failed(ago(4)), failed(ago(3)), failed(ago(2)), failed(ago(1.5))];
    expect(identityStanding(rows, now)).toMatchObject({ blocked: 'too_many_attempts', canStart: false, attempts: 5 });
    const reset = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'allow_retry', createdAt: ago(1) });
    const after = identityStanding([...rows, reset], now);
    expect(after).toMatchObject({ status: 'not_started', attempts: 0, canStart: true });
    expect(after.blocked).toBeUndefined();
    expect(after.requested).toBeUndefined();
  });

  it('closes helper onboarding under 18 until staff allow new tries', () => {
    const under = failed(ago(1), 'under_18');
    expect(identityStanding([{ ...under, isAdult: false }], now)).toMatchObject({ blocked: 'under_18', canStart: false });
  });

  it('starts again after a staff request or a legal-name change, and the earlier pass stops counting', () => {
    const pass = idRow({ status: 'verified', verifiedAt: ago(30), nameMatches: true, createdAt: ago(30) });
    const request = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'name_changed', createdAt: ago(1) });
    expect(identityStanding([pass, request], now)).toMatchObject({ status: 'not_started', verified: false, cleared: false, requested: 'name_changed', canStart: true });
  });

  it('lets a check in progress be continued (a new session counts as a try)', () => {
    expect(identityStanding([idRow({ status: 'processing', createdAt: ago(0.1) })], now)).toMatchObject({ status: 'processing', canStart: true, attempts: 1 });
  });

  it('closes hosted sessions nobody finished within 48 hours', () => {
    expect(identitySessionIsStale({ status: 'processing', providerSessionId: 'vs', createdAt: ago(2.1) }, now)).toBe(true);
    expect(identitySessionIsStale({ status: 'processing', providerSessionId: 'vs', createdAt: ago(1) }, now)).toBe(false);
    expect(identitySessionIsStale({ status: 'verified', providerSessionId: 'vs', createdAt: ago(9) }, now)).toBe(false);
  });
});

describe('name matching', () => {
  it('ignores case, accents, punctuation and hyphens, and accepts a shortened first name', () => {
    expect(namesMatch({ firstName: 'José', lastName: "O'Neil-Smith" }, { firstName: 'JOSE', lastName: 'ONEIL SMITH' })).toBe(true);
    expect(namesMatch({ firstName: 'Alex', lastName: 'Price' }, { firstName: 'Alexandra', lastName: 'Price' })).toBe(true);
    expect(namesMatch({ firstName: 'Maya', lastName: 'Rivera' }, { firstName: 'Maya Luisa', lastName: 'Rivera' })).toBe(true);
  });

  it('sends anything else to a staff name check', () => {
    expect(namesMatch({ firstName: 'Bob', lastName: 'Price' }, { firstName: 'Robert', lastName: 'Price' })).toBe(false);
    expect(namesMatch({ firstName: 'Maya', lastName: 'Rivera' }, { firstName: 'Maya', lastName: 'Lopez' })).toBe(false);
    expect(namesMatch({ firstName: '', lastName: '' }, { firstName: '', lastName: '' })).toBe(false);
  });
});

function addressRow(over: Partial<AddressRow>): AddressRow {
  seq += 1;
  return { id: `adr_${seq}`, status: 'in_review', documentType: 'utility_bill', documentFileId: `fil_${seq}`, submittedAt: ago(1), decidedAt: null, rejectionReason: null, createdAt: ago(10 - seq * 0.01), ...over };
}

describe('address standing', () => {
  it('goes from not started to in review to verified or rejected', () => {
    expect(addressStanding([])).toMatchObject({ status: 'not_started', verified: false, canSubmit: true });
    expect(addressStanding([addressRow({})])).toMatchObject({ status: 'in_review', verified: false, canSubmit: false });
    expect(addressStanding([addressRow({ status: 'verified', decidedAt: ago(1) })])).toMatchObject({ status: 'verified', verified: true, verifiedAt: ago(1) });
    expect(addressStanding([addressRow({ status: 'rejected', rejectionReason: 'too_old' })])).toMatchObject({ status: 'rejected', rejectionReason: 'too_old', canSubmit: true });
  });

  it('keeps an earlier verification while a newer proof is in review or turned down', () => {
    const verified = addressRow({ status: 'verified', decidedAt: ago(60), createdAt: ago(61) });
    const moving = addressRow({ status: 'in_review', createdAt: ago(1) });
    expect(addressStanding([verified, moving])).toMatchObject({ status: 'verified', verified: true, update: { status: 'in_review' }, canSubmit: false });
    const turnedDown = { ...moving, status: 'rejected', rejectionReason: 'name_mismatch' };
    expect(addressStanding([verified, turnedDown])).toMatchObject({ status: 'verified', update: { status: 'rejected', rejectionReason: 'name_mismatch' }, canSubmit: true });
  });

  it('stops counting a verification once staff ask for a new proof', () => {
    const verified = addressRow({ status: 'verified', decidedAt: ago(60), createdAt: ago(61) });
    const requested = addressRow({ status: 'requested', documentFileId: null, createdAt: ago(2) });
    expect(addressStanding([verified, requested])).toMatchObject({ status: 'requested', verified: false, canSubmit: true });
    expect(addressStanding([verified, requested, addressRow({ createdAt: ago(1) })])).toMatchObject({ status: 'in_review', verified: false });
  });

  it('ignores withdrawn proofs', () => {
    expect(addressStanding([addressRow({ status: 'withdrawn' })]).status).toBe('not_started');
  });

  it('deletes documents 30 days after the decision, and withdrawn ones right away', () => {
    expect(addressDocumentDue({ documentFileId: 'fil', decidedAt: ago(30), status: 'verified' }, now)).toBe(true);
    expect(addressDocumentDue({ documentFileId: 'fil', decidedAt: ago(29), status: 'rejected' }, now)).toBe(false);
    expect(addressDocumentDue({ documentFileId: 'fil', decidedAt: null, status: 'in_review' }, now)).toBe(false);
    expect(addressDocumentDue({ documentFileId: 'fil', decidedAt: null, status: 'withdrawn' }, now)).toBe(true);
    expect(addressDocumentDue({ documentFileId: null, decidedAt: ago(90), status: 'verified' }, now)).toBe(false);
  });
});

function bgRow(over: Partial<BackgroundRow>): BackgroundRow {
  seq += 1;
  return { id: `bgc_${seq}`, status: 'pending', providerRef: `chk_${seq}`, completedAt: null, expiresAt: null, invitationExpiresAt: null, adjudication: null, preAdverseAt: null, createdAt: ago(10 - seq * 0.01), ...over };
}

describe('background standing', () => {
  it('counts a clear check for 12 months, with the badge', () => {
    const clear = bgRow({ status: 'clear', completedAt: ago(100), expiresAt: ahead(265) });
    expect(backgroundStanding([clear], now)).toMatchObject({ status: 'clear', eligible: true, badgeAt: ago(100), validUntil: ahead(265), renewalOpen: false, canStart: false });
  });

  it('opens a renewal 30 days before it runs out, and keeps counting while the renewal runs', () => {
    const clear = bgRow({ status: 'clear', completedAt: ago(340), expiresAt: ahead(25), createdAt: ago(341) });
    expect(backgroundStanding([clear], now)).toMatchObject({ eligible: true, renewalOpen: true, canStart: true });
    const renewal = bgRow({ status: 'invited', invitationExpiresAt: ahead(6), createdAt: ago(1) });
    expect(backgroundStanding([clear, renewal], now)).toMatchObject({ status: 'invited', eligible: true, canStart: false, invitationExpiresAt: ahead(6) });
  });

  it('expires a check after 12 months and an unused invitation after 7 days', () => {
    expect(backgroundStanding([bgRow({ status: 'clear', completedAt: ago(366), expiresAt: ago(1) })], now)).toMatchObject({ status: 'expired', eligible: false, canStart: true });
    expect(backgroundStanding([bgRow({ status: 'invited', invitationExpiresAt: ago(1) })], now)).toMatchObject({ status: 'expired', canStart: true });
  });

  it('holds a consider result for review: engaged counts without the badge; pre-adverse waits; post-adverse is final', () => {
    const consider = bgRow({ status: 'consider', completedAt: ago(2) });
    expect(backgroundStanding([consider], now)).toMatchObject({ status: 'consider', eligible: false, canStart: false });
    const engaged = { ...consider, adjudication: 'engaged', expiresAt: ahead(363) };
    const standing = backgroundStanding([engaged], now);
    expect(standing).toMatchObject({ eligible: true, adjudication: 'engaged', validUntil: ahead(363) });
    expect(standing.badgeAt).toBeUndefined();
    const pre = { ...consider, adjudication: 'pre_adverse', preAdverseAt: ago(1) };
    expect(backgroundStanding([pre], now)).toMatchObject({ adjudication: 'pre_adverse', disputeUntil: ahead(6), eligible: false, canStart: false });
    const post = { ...consider, adjudication: 'post_adverse' };
    expect(backgroundStanding([post], now)).toMatchObject({ adjudication: 'post_adverse', eligible: false, canStart: false });
  });

  it('lets a check start again after a cancellation or a staff request', () => {
    expect(backgroundStanding([bgRow({ status: 'canceled' })], now)).toMatchObject({ canStart: true });
    const post = bgRow({ status: 'consider', adjudication: 'post_adverse', createdAt: ago(5) });
    const request = bgRow({ status: 'not_started', providerRef: null, createdAt: ago(1) });
    expect(backgroundStanding([post, request], now)).toMatchObject({ status: 'not_started', canStart: true });
  });

  it('sends renewal notices at 30 days, 7 days and expiry, once each', () => {
    expect(backgroundNoticeDue({ expiresAt: ahead(40), expiryNotices: 0 }, now)).toBeNull();
    expect(backgroundNoticeDue({ expiresAt: ahead(29), expiryNotices: 0 }, now)).toBe(1);
    expect(backgroundNoticeDue({ expiresAt: ahead(29), expiryNotices: 1 }, now)).toBeNull();
    expect(backgroundNoticeDue({ expiresAt: ahead(6), expiryNotices: 1 }, now)).toBe(2);
    expect(backgroundNoticeDue({ expiresAt: ahead(6), expiryNotices: 0 }, now)).toBe(2);
    expect(backgroundNoticeDue({ expiresAt: ago(1), expiryNotices: 2 }, now)).toBe(3);
    expect(backgroundNoticeDue({ expiresAt: ago(1), expiryNotices: 3 }, now)).toBeNull();
    expect(backgroundNoticeDue({ expiresAt: null, expiryNotices: 0 }, now)).toBeNull();
  });
});
