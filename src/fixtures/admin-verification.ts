import type {
  AdminIdentityCaptureView,
  AdminPersonVerification,
  AdminVerificationHandlers,
  AdminVerificationsPageData,
  IdentityAutoCheck,
  PersonSummary,
} from '@/contracts';

/** Staff verification reviews (src/contracts/admin-verification.ts): the queues and a person's section. */

const priya: PersonSummary = { id: 'usr_priya', displayName: 'Priya S.', initials: 'PS', memberSince: '2026-11-14T15:00:00.000Z', phoneVerified: true };
const devon: PersonSummary = { id: 'usr_devon', displayName: 'Devon K.', initials: 'DK', memberSince: '2026-11-17T15:00:00.000Z', phoneVerified: true };
const lee: PersonSummary = { id: 'usr_lee', displayName: 'Lee M.', initials: 'LM', memberSince: '2026-06-01T15:00:00.000Z', phoneVerified: true };
const rosa: PersonSummary = { id: 'usr_rosa', displayName: 'Rosa T.', initials: 'RT', memberSince: '2026-11-16T15:00:00.000Z', phoneVerified: true };
const omar: PersonSummary = { id: 'usr_omar', displayName: 'Omar H.', initials: 'OH', memberSince: '2026-11-18T15:00:00.000Z', phoneVerified: true };

/** What the automatic reading of an ID found: everything matches, or the name and expiry need a look. */
const idAllMatch: IdentityAutoCheck = { readable: true, nameMatches: true, isAdult: true, notExpired: true, expires: { month: 4, year: 2029 }, documentType: 'drivers_license' };
const idFlags: IdentityAutoCheck = { readable: true, nameMatches: false, isAdult: true, notExpired: false, expires: { month: 10, year: 2026 }, documentType: 'state_id' };

/** Our own ID check's tries as staff see them (stage 1). */
const rosaInReview: AdminIdentityCaptureView = { id: 'idc_rosa', status: 'submitted', documentType: 'drivers_license', submittedAt: '2026-11-19T18:20:00.000Z', prompt: 'look_left', autoCheck: idAllMatch, photos: ['front', 'back', 'selfie'] };
const rosaTurnedDown: AdminIdentityCaptureView = {
  id: 'idc_rosa_first',
  status: 'rejected',
  documentType: 'drivers_license',
  submittedAt: '2026-11-18T16:00:00.000Z',
  prompt: 'three_fingers',
  autoCheck: idAllMatch,
  photos: ['front', 'back', 'selfie'],
  decidedAt: '2026-11-18T19:00:00.000Z',
  decidedBy: 'Taylor B.',
  rejectionReason: 'prompt_not_followed',
  note: 'Selfie shows no hand; asked for a new one with the prompt.',
};
const priyaApproved: AdminIdentityCaptureView = { id: 'idc_priya', status: 'approved', documentType: 'drivers_license', submittedAt: '2026-11-17T13:00:00.000Z', prompt: 'smile', autoCheck: idAllMatch, photos: ['front', 'back', 'selfie'], decidedAt: '2026-11-17T13:40:00.000Z', decidedBy: 'Taylor B.', note: 'ID and selfie match; smile as asked.' };
const devonApproved: AdminIdentityCaptureView = { id: 'idc_devon', status: 'approved', documentType: 'passport', submittedAt: '2026-10-10T13:00:00.000Z', prompt: 'look_up', autoCheck: { readable: true, nameMatches: false, isAdult: true, notExpired: true, expires: { month: 2, year: 2031 }, documentType: 'passport' }, photos: [], photosDeletedAt: '2026-11-09T16:00:00.000Z', decidedAt: '2026-10-10T16:00:00.000Z', decidedBy: 'Morgan L.', note: 'Passport matches; married name on the account.' };

export const adminVerificationsAddressData: AdminVerificationsPageData = {
  queue: 'address',
  counts: { address: 2, identity: 4, background: 1 },
  address: [
    {
      id: 'adr_priya',
      person: priya,
      submittedAt: '2026-11-17T16:00:00.000Z',
      documentType: 'utility_bill',
      areaName: 'Mueller',
      autoCheck: { readable: true, nameMatches: true, addressMatches: true, recent: true, documentType: 'utility_bill' },
      overdue: true,
    },
    { id: 'adr_rosa', person: rosa, submittedAt: '2026-11-19T20:30:00.000Z', documentType: 'bank_statement', areaName: 'Hyde Park', overdue: false },
  ],
  identity: [],
  background: [],
  canDecide: true,
};

export const adminVerificationsIdentityData: AdminVerificationsPageData = {
  ...adminVerificationsAddressData,
  queue: 'identity',
  address: [],
  identity: [
    { id: 'idc_omar', person: omar, kind: 'capture', at: '2026-11-18T09:30:00.000Z', attempts: 1, capture: { documentType: 'state_id', autoCheck: idFlags, overdue: true } },
    { id: 'idv_devon', person: devon, kind: 'name_check', at: '2026-11-18T14:00:00.000Z', attempts: 1 },
    { id: 'idv_lee', person: lee, kind: 'too_many_attempts', at: '2026-11-19T17:10:00.000Z', attempts: 5 },
    { id: 'idc_rosa', person: rosa, kind: 'capture', at: '2026-11-19T18:20:00.000Z', attempts: 2, capture: { documentType: 'drivers_license', autoCheck: idAllMatch, overdue: false } },
  ],
};

export const adminVerificationsBackgroundData: AdminVerificationsPageData = {
  ...adminVerificationsAddressData,
  queue: 'background',
  address: [],
  background: [{ id: 'bgc_lee', person: lee, completedAt: '2026-11-15T16:00:00.000Z', adjudication: 'pre_adverse', finalDecisionFrom: '2026-11-23T16:00:00.000Z', requiredFor: ['furniture-assembly', 'moving-help'] }],
};

export const adminVerificationsEmptyData: AdminVerificationsPageData = {
  queue: 'address',
  counts: { address: 0, identity: 0, background: 0 },
  address: [],
  identity: [],
  background: [],
  canDecide: true,
};

/** A support agent sees the queues but can't decide. */
export const adminVerificationsReadOnlyData: AdminVerificationsPageData = { ...adminVerificationsAddressData, canDecide: false };

/** Jordan: every step done. */
export const jordanVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0201', verifiedAt: '2026-11-03T15:00:00.000Z' },
  agreement: { version: 'draft-0.1', acceptedAt: '2026-11-03T16:00:00.000Z' },
  // Verified before our own check existed (stage 1): no photos of ours.
  identity: { status: 'verified', verifiedAt: '2026-11-04T16:00:00.000Z', attempts: 1, nameMatches: true, consentAt: '2026-11-04T15:55:00.000Z', captures: [] },
  address: {
    status: 'verified',
    verifiedAt: '2026-11-05T15:00:00.000Z',
    proofs: [{ id: 'adr_jordan', status: 'verified', submittedAt: '2026-11-04T18:00:00.000Z', documentType: 'lease', areaName: 'East Austin', documentAvailable: true, decidedAt: '2026-11-05T15:00:00.000Z', decidedBy: 'Taylor B.' }],
  },
  payout: { status: 'active' },
  background: { status: 'clear', completedAt: '2026-11-06T16:00:00.000Z', validUntil: '2027-11-06T16:00:00.000Z', requiredFor: ['furniture-assembly', 'moving-help'], disclosureAt: '2026-11-05T17:00:00.000Z' },
  actions: ['request_address', 'request_identity'],
};

/** Priya: the proof of address waits, with an automatic reading that matches. */
export const priyaVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0204', verifiedAt: '2026-11-14T15:00:00.000Z' },
  agreement: { version: 'draft-0.1', acceptedAt: '2026-11-14T15:20:00.000Z' },
  identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z', attempts: 2, nameMatches: true, consentAt: '2026-11-17T12:50:00.000Z', captures: [priyaApproved] },
  address: {
    status: 'in_review',
    proofs: [
      {
        id: 'adr_priya',
        status: 'in_review',
        submittedAt: '2026-11-17T16:00:00.000Z',
        documentType: 'utility_bill',
        areaName: 'Mueller',
        documentAvailable: true,
        autoCheck: { readable: true, nameMatches: true, addressMatches: true, recent: true, documentType: 'utility_bill' },
      },
      { id: 'adr_priya_old', status: 'rejected', submittedAt: '2026-11-16T12:00:00.000Z', documentType: 'bank_statement', areaName: 'Mueller', documentAvailable: false, documentDeletedAt: '2026-11-16T12:00:00.000Z', decidedAt: '2026-11-16T15:00:00.000Z', decidedBy: 'Taylor B.', rejectionReason: 'too_old' },
    ],
  },
  payout: { status: 'pending' },
  background: { status: 'not_started', requiredFor: ['light-cleaning'] },
  actions: ['review_address', 'view_identity_photos', 'request_identity'],
};

/** Devon: a verified ID whose name differs from the account's. */
export const devonVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0207', verifiedAt: '2026-11-17T15:00:00.000Z' },
  agreement: { version: 'draft-0.1', acceptedAt: '2026-11-17T15:10:00.000Z' },
  identity: { status: 'verified', verifiedAt: '2026-11-18T14:00:00.000Z', attempts: 2, nameMatches: false, consentAt: '2026-10-10T12:55:00.000Z', captures: [devonApproved] },
  address: { status: 'not_started', proofs: [] },
  payout: { status: 'not_started' },
  background: { status: 'not_required', requiredFor: [] },
  actions: ['confirm_name', 'request_identity'],
};

/** Lee: a background check after the pre-adverse notice, past the dispute window. */
export const leeVerification: AdminPersonVerification = {
  ...jordanVerification,
  background: { status: 'consider', completedAt: '2026-11-15T16:00:00.000Z', adjudication: 'pre_adverse', finalDecisionFrom: '2026-11-23T16:00:00.000Z', requiredFor: ['furniture-assembly', 'moving-help'], disclosureAt: '2026-11-10T16:00:00.000Z' },
  actions: ['request_address', 'request_identity', 'engage_background', 'post_adverse_background'],
};

/** Rosa: new ID photos waiting for review, after the first ones were turned down. */
export const rosaVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0209', verifiedAt: '2026-11-16T15:00:00.000Z' },
  agreement: { version: 'draft-0.1', acceptedAt: '2026-11-16T15:10:00.000Z' },
  identity: { status: 'not_started', attempts: 2, consentAt: '2026-11-18T15:50:00.000Z', captures: [rosaInReview, rosaTurnedDown] },
  address: { status: 'not_started', proofs: [] },
  payout: { status: 'not_started' },
  background: { status: 'not_started', requiredFor: ['light-cleaning'] },
  actions: ['review_identity_capture', 'view_identity_photos'],
};

/** A support agent sees Rosa's statuses and answers, but can't open the photos or decide. */
export const rosaReadOnlyVerification: AdminPersonVerification = { ...rosaVerification, actions: [] };

/** A poster who never started helper onboarding. */
export const posterVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0101', verifiedAt: '2026-09-04T15:00:00.000Z' },
  identity: { status: 'not_started', attempts: 0, captures: [] },
  address: { status: 'not_started', proofs: [] },
  payout: { status: 'not_started' },
  background: { status: 'not_required', requiredFor: [] },
  actions: [],
};

export const adminHomeVerifications = { counts: { address: 2, identity: 4, background: 1 }, oldestAt: '2026-11-15T16:00:00.000Z' };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** The photos staff see once opened (placeholder drawings, never real IDs or faces). */
export const identityCaptureRevealed = {
  ok: true as const,
  photos: [
    { kind: 'front' as const, url: '/samples/id-front.svg' },
    { kind: 'back' as const, url: '/samples/id-back.svg' },
    { kind: 'selfie' as const, url: '/samples/id-selfie.svg' },
  ],
  prompt: 'look_left' as const,
  expiresAt: '2026-11-20T16:05:00.000Z',
};

export const fakeAdminVerificationHandlers: AdminVerificationHandlers = {
  onRevealAddressProof: () => wait({ ok: true, address: '1234 Example Lane, Austin, TX 78723', document: { url: '/samples/proof-of-address.svg', kind: 'image' }, expiresAt: '2026-11-20T16:05:00.000Z' }),
  onDecideAddress: () => wait({ ok: true, code: 'updated' }),
  onRevealIdentityCapture: () => wait(identityCaptureRevealed),
  onDecideIdentityCapture: () => wait({ ok: true, code: 'updated' }),
  onVerificationAction: () => wait({ ok: true, code: 'updated' }),
};
