import { describe, expect, it } from 'vitest';
import {
  addressDocumentDue,
  addressStanding,
  backgroundNoticeDue,
  backgroundStanding,
  capturePhotosDue,
  deriveIdentityAutoCheck,
  identitySessionIsStale,
  identityStanding,
  idExpiresAt,
  idExpiryNoticeDue,
  livenessPromptFor,
  namesMatch,
  type AddressRow,
  type BackgroundRow,
  type CaptureRow,
  type IdentityRow,
} from './standing';

const DAY = 86_400_000;
const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';
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
    expect(identityStanding([], now, [], AUSTIN)).toMatchObject({ status: 'not_started', verified: false, cleared: false, attempts: 0, canStart: true });
  });

  it('clears a verified check whose name matched, and holds one whose name did not until staff confirm', () => {
    const matched = idRow({ status: 'verified', verifiedAt: ago(1), nameMatches: true, createdAt: ago(1) });
    expect(identityStanding([matched], now, [], AUSTIN)).toMatchObject({ status: 'verified', cleared: true, canStart: false });
    const differs = idRow({ status: 'verified', verifiedAt: ago(1), nameMatches: false, createdAt: ago(1) });
    expect(identityStanding([differs], now, [], AUSTIN)).toMatchObject({ status: 'verified', verified: true, cleared: false, nameCheck: 'in_review', reviewSince: ago(1) });
    const confirmed = { ...differs, nameConfirmedAt: now };
    expect(identityStanding([confirmed], now, [], AUSTIN)).toMatchObject({ cleared: true });
    expect(identityStanding([confirmed], now, [], AUSTIN).nameCheck).toBeUndefined();
  });

  it('allows 3 tries in 24 hours and says when the next one opens', () => {
    const rows = [failed(ago(0.9)), failed(ago(0.5)), failed(ago(0.1))];
    const standing = identityStanding(rows, now, [], AUSTIN);
    expect(standing).toMatchObject({ blocked: 'try_later', canStart: false, attempts: 3, failureReason: 'document_unreadable' });
    expect(standing.retryAt).toEqual(new Date(rows[0]!.createdAt.getTime() + DAY));
  });

  it('sends 5 tries without a pass to staff, and a staff reset allows new tries', () => {
    const rows = [failed(ago(5)), failed(ago(4)), failed(ago(3)), failed(ago(2)), failed(ago(1.5))];
    expect(identityStanding(rows, now, [], AUSTIN)).toMatchObject({ blocked: 'too_many_attempts', canStart: false, attempts: 5 });
    const reset = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'allow_retry', createdAt: ago(1) });
    const after = identityStanding([...rows, reset], now, [], AUSTIN);
    expect(after).toMatchObject({ status: 'not_started', attempts: 0, canStart: true });
    expect(after.blocked).toBeUndefined();
    expect(after.requested).toBeUndefined();
  });

  it('closes helper onboarding under 18 until staff allow new tries', () => {
    const under = failed(ago(1), 'under_18');
    expect(identityStanding([{ ...under, isAdult: false }], now, [], AUSTIN)).toMatchObject({ blocked: 'under_18', canStart: false });
  });

  it('starts again after a staff request or a legal-name change, and the earlier pass stops counting', () => {
    const pass = idRow({ status: 'verified', verifiedAt: ago(30), nameMatches: true, createdAt: ago(30) });
    const request = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'name_changed', createdAt: ago(1) });
    expect(identityStanding([pass, request], now, [], AUSTIN)).toMatchObject({ status: 'not_started', verified: false, cleared: false, requested: 'name_changed', canStart: true });
  });

  it('lets a check in progress be continued (a new session counts as a try)', () => {
    expect(identityStanding([idRow({ status: 'processing', createdAt: ago(0.1) })], now, [], AUSTIN)).toMatchObject({ status: 'processing', canStart: true, attempts: 1 });
  });

  it('closes hosted sessions nobody finished within 48 hours', () => {
    expect(identitySessionIsStale({ status: 'processing', providerSessionId: 'vs', createdAt: ago(2.1) }, now)).toBe(true);
    expect(identitySessionIsStale({ status: 'processing', providerSessionId: 'vs', createdAt: ago(1) }, now)).toBe(false);
    expect(identitySessionIsStale({ status: 'verified', providerSessionId: 'vs', createdAt: ago(9) }, now)).toBe(false);
  });
});

let captureSeq = 0;
function captureRow(over: Partial<CaptureRow>): CaptureRow {
  captureSeq += 1;
  const createdAt = over.createdAt ?? ago(5 - captureSeq * 0.01);
  return { id: `idc_${captureSeq}`, status: 'submitted', documentType: 'drivers_license', rejectionReason: null, submittedAt: createdAt, decidedAt: null, createdAt, updatedAt: createdAt, ...over };
}
const decided = (status: 'approved' | 'rejected' | 'canceled', createdAt: Date, reason: string | null = status === 'rejected' ? 'document_unreadable' : null) => {
  const at = new Date(createdAt.getTime() + 2 * 3_600_000);
  return captureRow({ status, rejectionReason: reason, createdAt, decidedAt: at, updatedAt: at });
};

describe('our own ID check (stage 1)', () => {
  it('asks for photos first; the provider only opens once they are approved', () => {
    expect(identityStanding([], now, [], AUSTIN)).toMatchObject({ captureApproved: false, canCapture: true, canStart: true, attempts: 0 });
    const inReview = identityStanding([], now, [captureRow({ createdAt: ago(0.1) })], AUSTIN);
    expect(inReview).toMatchObject({ captureApproved: false, canCapture: false, attempts: 1, capture: { status: 'submitted' } });
    expect(inReview.blocked).toBeUndefined();
    const approved = identityStanding([], now, [decided('approved', ago(0.2))], AUSTIN);
    expect(approved).toMatchObject({ captureApproved: true, canCapture: false, canStart: true, status: 'not_started', attempts: 1 });
  });

  it('counts photos and provider sessions as tries; approved photos are not a failed try', () => {
    const captures = [decided('rejected', ago(0.9)), decided('rejected', ago(0.8)), decided('approved', ago(0.7))];
    // Two failed tries and an approval today: the double check can start.
    expect(identityStanding([], now, captures, AUSTIN)).toMatchObject({ captureApproved: true, canStart: true, attempts: 3 });
    expect(identityStanding([], now, captures, AUSTIN).blocked).toBeUndefined();
    // A double check that staff let the helper try again still counts: 3 failed tries today, so the next
    // opens 24 hours after the first.
    const standing = identityStanding([{ ...failed(ago(0.3)), reviewOutcome: 'retry_allowed' }], now, captures, AUSTIN);
    expect(standing).toMatchObject({ blocked: 'try_later', canStart: false, captureApproved: true, attempts: 4 });
    expect(standing.retryAt).toEqual(new Date(captures[0]!.createdAt.getTime() + DAY));
  });

  it('pauses the helper when the double check fails after our team approved the photos, until staff decide', () => {
    const approved = decided('approved', ago(2));
    const declined = idRow({ status: 'requires_input', failureReason: 'other', createdAt: ago(1), updatedAt: ago(0.9) });
    const standing = identityStanding([declined], now, [approved], AUSTIN);
    expect(standing).toMatchObject({ blocked: 'double_check_review', canStart: false, canCapture: false, captureApproved: true, doubleCheck: { id: declined.id } });
    expect(standing.reviewSince).toEqual(ago(0.9));
    // A session from before the approval isn't the double check.
    const before = idRow({ status: 'requires_input', failureReason: 'other', createdAt: ago(3) });
    expect(identityStanding([before], now, [approved], AUSTIN).blocked).toBeUndefined();
    // Staff let them try again: no longer paused. Or turned the photos down: new photos.
    expect(identityStanding([{ ...declined, reviewOutcome: 'retry_allowed' }], now, [approved], AUSTIN)).toMatchObject({ canStart: true, captureApproved: true });
    const rejected = { ...approved, status: 'rejected', rejectionReason: 'double_check_failed' };
    expect(identityStanding([{ ...declined, reviewOutcome: 'rejected' }], now, [rejected], AUSTIN)).toMatchObject({ canCapture: true, captureApproved: false });
    // A double check that was only canceled (closed, expired) can simply start again.
    const closed = idRow({ status: 'canceled', createdAt: ago(1) });
    expect(identityStanding([closed], now, [approved], AUSTIN)).toMatchObject({ canStart: true });
    // Under 18 stays what it is.
    expect(identityStanding([{ ...declined, failureReason: 'under_18', isAdult: false }], now, [approved], AUSTIN).blocked).toBe('under_18');
  });

  it('pauses for 24 hours after 3 turned-down tries, and never while photos wait for review', () => {
    const three = [decided('rejected', ago(0.9)), decided('rejected', ago(0.6)), decided('rejected', ago(0.3))];
    expect(identityStanding([], now, three, AUSTIN)).toMatchObject({ blocked: 'try_later', canCapture: false, canStart: false });
    const waiting = [decided('rejected', ago(0.9)), decided('rejected', ago(0.6)), captureRow({ createdAt: ago(0.3) })];
    expect(identityStanding([], now, waiting, AUSTIN).blocked).toBeUndefined();
  });

  it('sends 5 tries without a pass to staff, photos and sessions together', () => {
    const captures = [decided('rejected', ago(6)), decided('rejected', ago(5)), decided('canceled', ago(4)), decided('approved', ago(3.5))];
    // Double checks staff already let the helper try again (each still a failed try).
    const sessions = [failed(ago(3)), failed(ago(2))].map((row) => ({ ...row, reviewOutcome: 'retry_allowed' }));
    const standing = identityStanding(sessions, now, captures, AUSTIN);
    expect(standing).toMatchObject({ blocked: 'too_many_attempts', canStart: false, attempts: 6 });
    expect(standing.reviewSince).toEqual(sessions[1]!.updatedAt);
  });

  it('closes helper setup when staff find the person is under 18, until they allow new tries', () => {
    const under = decided('rejected', ago(1), 'under_18');
    expect(identityStanding([], now, [under], AUSTIN)).toMatchObject({ blocked: 'under_18', canCapture: false, canStart: false });
    const reset = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'allow_retry', createdAt: ago(0.5) });
    const after = identityStanding([reset], now, [under], AUSTIN);
    expect(after).toMatchObject({ canCapture: true, captureApproved: false, attempts: 0 });
    expect(after.blocked).toBeUndefined();
    expect(after.capture).toBeUndefined();
  });

  it('starts over after a staff request: the earlier photos and pass stop counting', () => {
    const photos = decided('approved', ago(10));
    const pass = idRow({ status: 'verified', verifiedAt: ago(9), nameMatches: true, createdAt: ago(9) });
    const request = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'staff_request', createdAt: ago(1) });
    expect(identityStanding([pass, request], now, [photos], AUSTIN)).toMatchObject({ status: 'not_started', verified: false, captureApproved: false, canCapture: true, requested: 'staff_request', attempts: 0 });
    // Photos sent the moment the new check was asked for belong to it.
    expect(identityStanding([pass, request], now, [photos, captureRow({ createdAt: ago(1) })], AUSTIN)).toMatchObject({ attempts: 1, capture: { status: 'submitted' } });
  });

  it('keeps helpers verified before our own check existed verified, with nothing to send', () => {
    const pass = idRow({ status: 'verified', verifiedAt: ago(30), nameMatches: true, createdAt: ago(30) });
    expect(identityStanding([pass], now, [], AUSTIN)).toMatchObject({ verified: true, cleared: true, canCapture: false, captureApproved: false });
  });

  it('keeps the photos a year after the decision for review (owner, 2026-11-27), canceled ones not at all', () => {
    const base = { filesDeletedAt: null, hasFiles: true };
    expect(capturePhotosDue({ ...base, status: 'approved', decidedAt: ago(30) }, now)).toBe(false);
    expect(capturePhotosDue({ ...base, status: 'approved', decidedAt: ago(364) }, now)).toBe(false);
    expect(capturePhotosDue({ ...base, status: 'approved', decidedAt: ago(365) }, now)).toBe(true);
    expect(capturePhotosDue({ ...base, status: 'rejected', decidedAt: ago(366) }, now)).toBe(true);
    expect(capturePhotosDue({ ...base, status: 'canceled', decidedAt: now }, now)).toBe(true);
    expect(capturePhotosDue({ ...base, status: 'submitted', decidedAt: null }, now)).toBe(false);
    expect(capturePhotosDue({ status: 'rejected', decidedAt: ago(40), filesDeletedAt: ago(5), hasFiles: false }, now)).toBe(false);
  });

  it('holds the double check while the ID is on another account too, until staff clear it (6.3)', () => {
    const flagged = { ...decided('approved', ago(1)), duplicateOfUserId: 'usr_other' };
    const held = identityStanding([], now, [flagged], AUSTIN);
    expect(held).toMatchObject({ blocked: 'duplicate_id', canStart: false, canCapture: false, captureApproved: true, duplicate: { id: flagged.id }, reviewSince: flagged.submittedAt });
    // Also while the photos are still in review, and an under-18 finding comes first.
    expect(identityStanding([], now, [captureRow({ createdAt: ago(0.1), duplicateOfUserId: 'usr_other' })], AUSTIN).blocked).toBe('duplicate_id');
    expect(identityStanding([], now, [flagged, decided('rejected', ago(0.5), 'under_18')], AUSTIN).blocked).toBe('under_18');
    // Cleared by staff, or turned down: no hold.
    expect(identityStanding([], now, [{ ...flagged, duplicateClearedAt: ago(0.5) }], AUSTIN).blocked).toBeUndefined();
    expect(identityStanding([], now, [{ ...flagged, status: 'rejected', rejectionReason: 'duplicate_id' }], AUSTIN).blocked).toBeUndefined();
  });

  it('picks the selfie prompt from a keyed hash of the person and the try, so reloading never changes it', () => {
    expect(livenessPromptFor('usr_a', 0, 'secret')).toBe(livenessPromptFor('usr_a', 0, 'secret'));
    const prompts = new Set(Array.from({ length: 60 }, (_, tries) => livenessPromptFor('usr_a', tries, 'secret')));
    // Only the turns the face check can verify (2026-11-27), each of them.
    expect([...prompts].sort()).toEqual(['look_left', 'look_right', 'look_up']);
    const other = Array.from({ length: 12 }, (_, tries) => livenessPromptFor('usr_a', tries, 'another secret'));
    expect(other).not.toEqual(Array.from({ length: 12 }, (_, tries) => livenessPromptFor('usr_a', tries, 'secret')));
  });
});

describe('the ID running out (6.3)', () => {
  const expiring = (month: number, year: number, createdAt: Date) => ({ ...decided('approved', createdAt), autoCheck: { expiresMonth: month, expiresYear: year } });

  it('ends at the start of the month after the expiry month, in Austin', () => {
    expect(idExpiresAt(12, 2026, AUSTIN)).toEqual(new Date('2027-01-01T06:00:00.000Z'));
    expect(idExpiresAt(6, 2027, AUSTIN)).toEqual(new Date('2027-07-01T05:00:00.000Z'));
    expect(idExpiresAt(13, 2026, AUSTIN)).toBeUndefined();
    expect(idExpiryNoticeDue(new Date('2027-01-01T06:00:00.000Z'), new Date('2026-12-02T05:59:00.000Z'))).toBe(false);
    expect(idExpiryNoticeDue(new Date('2027-01-01T06:00:00.000Z'), new Date('2026-12-02T06:00:00.000Z'))).toBe(true);
  });

  it('knows when the verification runs out, and stops counting it after that', () => {
    const photos = expiring(12, 2026, ago(40));
    const pass = idRow({ status: 'verified', verifiedAt: ago(39), nameMatches: true, createdAt: ago(39) });
    expect(identityStanding([pass], now, [photos], AUSTIN)).toMatchObject({ verified: true, cleared: true, expiresAt: new Date('2027-01-01T06:00:00.000Z') });
    const later = new Date('2027-01-02T00:00:00.000Z');
    expect(identityStanding([pass], later, [photos], AUSTIN)).toMatchObject({ verified: true, cleared: false, requested: 'id_expired' });
    // Without the month (verified before our own check, or a reading that found none): nothing runs out.
    expect(identityStanding([pass], later, [decided('approved', ago(40))], AUSTIN).expiresAt).toBeUndefined();
  });

  it('keeps the earlier check counting while the new one asked for runs, until the month ends', () => {
    const photos = expiring(12, 2026, ago(40));
    const pass = idRow({ status: 'verified', verifiedAt: ago(39), nameMatches: true, createdAt: ago(39) });
    const asked = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'id_expiring', createdAt: ago(1) });
    const renewing = identityStanding([pass, asked], now, [photos], AUSTIN);
    expect(renewing).toMatchObject({ status: 'not_started', verified: false, cleared: true, verifiedAt: pass.verifiedAt, requested: 'id_expiring', renewal: { countsUntil: new Date('2027-01-01T06:00:00.000Z') }, canCapture: true, captureApproved: false, attempts: 0 });
    // New photos in review: still counting.
    expect(identityStanding([pass, asked], now, [photos, captureRow({ createdAt: ago(0.5) })], AUSTIN)).toMatchObject({ cleared: true, capture: { status: 'submitted' } });
    // The month ended before the new check passed.
    const after = identityStanding([pass, asked], new Date('2027-01-01T06:00:00.000Z'), [photos], AUSTIN);
    expect(after).toMatchObject({ cleared: false, requested: 'id_expired' });
    expect(after.renewal).toBeUndefined();
    // The new check passed: it's the one that counts, with its own ID.
    const newPhotos = expiring(3, 2031, ago(0.4));
    const newPass = idRow({ status: 'verified', verifiedAt: ago(0.2), nameMatches: true, createdAt: ago(0.3) });
    expect(identityStanding([pass, asked, newPass], new Date('2027-02-01T00:00:00.000Z'), [photos, newPhotos], AUSTIN)).toMatchObject({ cleared: true, expiresAt: new Date('2031-04-01T05:00:00.000Z') });
  });

  it("stops counting the earlier check when the new one turns something up for our team", () => {
    const photos = expiring(12, 2026, ago(40));
    const pass = idRow({ status: 'verified', verifiedAt: ago(39), nameMatches: true, createdAt: ago(39) });
    const asked = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'id_expiring', createdAt: ago(1) });
    const flagged = { ...decided('approved', ago(0.5)), duplicateOfUserId: 'usr_other' };
    const held = identityStanding([pass, asked], now, [photos, flagged], AUSTIN);
    expect(held).toMatchObject({ blocked: 'duplicate_id', cleared: false });
    expect(held.renewal).toBeUndefined();
    // A staff request or a name change in between: no grace.
    const request = idRow({ status: 'not_started', providerSessionId: null, requestedReason: 'name_changed', createdAt: ago(0.5) });
    expect(identityStanding([pass, asked, request], now, [photos], AUSTIN)).toMatchObject({ cleared: false, requested: 'name_changed' });
  });
});

describe('the automatic reading of an ID', () => {
  const vera = { firstName: 'Vera', lastName: 'Tester' };
  const reading = { readable: true, givenNames: 'VERA LYNN', surname: 'TESTER', dateOfBirth: '1990-04-02', expiryDate: '2029-04-02', documentType: 'drivers_license' as const, issuingState: 'TX' };

  it('keeps yes/no answers and the expiry month and year, never the name, birth date or state', () => {
    expect(deriveIdentityAutoCheck(reading, vera, now, AUSTIN)).toEqual({ readable: true, nameMatches: true, isAdult: true, notExpired: true, expiresMonth: 4, expiresYear: 2029, documentType: 'drivers_license' });
    expect(deriveIdentityAutoCheck({ ...reading, givenNames: 'Veronica', surname: 'Smith' }, vera, now, AUSTIN).nameMatches).toBe(false);
    expect(deriveIdentityAutoCheck({ readable: false }, vera, now, AUSTIN)).toEqual({ readable: false });
  });

  it('turns 18 on the 18th birthday in Austin, and an ID is good through its expiry date', () => {
    // 6 pm UTC on Nov 20 is noon in Austin.
    expect(deriveIdentityAutoCheck({ ...reading, dateOfBirth: '2008-11-20' }, vera, now, AUSTIN).isAdult).toBe(true);
    expect(deriveIdentityAutoCheck({ ...reading, dateOfBirth: '2008-11-21' }, vera, now, AUSTIN).isAdult).toBe(false);
    // 3 am UTC on Nov 21 is still Nov 20 in Austin.
    const lateEvening = new Date('2026-11-21T03:00:00.000Z');
    expect(deriveIdentityAutoCheck({ ...reading, dateOfBirth: '2008-11-21' }, vera, lateEvening, AUSTIN).isAdult).toBe(false);
    expect(deriveIdentityAutoCheck({ ...reading, expiryDate: '2026-11-20' }, vera, now, AUSTIN).notExpired).toBe(true);
    expect(deriveIdentityAutoCheck({ ...reading, expiryDate: '2026-11-19' }, vera, now, AUSTIN)).toMatchObject({ notExpired: false, expiresMonth: 11, expiresYear: 2026 });
  });

  it('uses the person’s own calendar: at 12:30 am in Gainesville it is already their birthday, not yet in Austin (plan 8.1)', () => {
    // 05:30 UTC on Nov 21 = 12:30 am EST in Gainesville, 11:30 pm CST Nov 20 in Austin.
    const justPastMidnight = new Date('2026-11-21T05:30:00.000Z');
    expect(deriveIdentityAutoCheck({ ...reading, dateOfBirth: '2008-11-21' }, vera, justPastMidnight, GAINESVILLE).isAdult).toBe(true);
    expect(deriveIdentityAutoCheck({ ...reading, dateOfBirth: '2008-11-21' }, vera, justPastMidnight, AUSTIN).isAdult).toBe(false);
    // An ID that expires in December 2026 is good until midnight Jan 1 where its holder lives.
    expect(idExpiresAt(12, 2026, GAINESVILLE)).toEqual(new Date('2027-01-01T05:00:00.000Z'));
  });

  it("leaves out what it can't be sure of: missing names and impossible dates", () => {
    const unsure = deriveIdentityAutoCheck({ readable: true, surname: 'Tester', dateOfBirth: '1990-02-30', expiryDate: 'soon' }, vera, now, AUSTIN);
    expect(unsure).toEqual({ readable: true });
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
