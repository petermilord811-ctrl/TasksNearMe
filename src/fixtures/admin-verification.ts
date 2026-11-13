import type {
  AdminPersonVerification,
  AdminVerificationHandlers,
  AdminVerificationsPageData,
  PersonSummary,
} from '@/contracts';

/** Staff verification reviews (src/contracts/admin-verification.ts): the queues and a person's section. */

const priya: PersonSummary = { id: 'usr_priya', displayName: 'Priya S.', initials: 'PS', memberSince: '2026-11-14T15:00:00.000Z', phoneVerified: true };
const devon: PersonSummary = { id: 'usr_devon', displayName: 'Devon K.', initials: 'DK', memberSince: '2026-11-17T15:00:00.000Z', phoneVerified: true };
const lee: PersonSummary = { id: 'usr_lee', displayName: 'Lee M.', initials: 'LM', memberSince: '2026-06-01T15:00:00.000Z', phoneVerified: true };
const rosa: PersonSummary = { id: 'usr_rosa', displayName: 'Rosa T.', initials: 'RT', memberSince: '2026-11-16T15:00:00.000Z', phoneVerified: true };

export const adminVerificationsAddressData: AdminVerificationsPageData = {
  queue: 'address',
  counts: { address: 2, identity: 2, background: 1 },
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
    { id: 'idv_devon', person: devon, kind: 'name_check', at: '2026-11-18T14:00:00.000Z', attempts: 1 },
    { id: 'idv_rosa', person: rosa, kind: 'too_many_attempts', at: '2026-11-19T17:10:00.000Z', attempts: 5 },
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
  identity: { status: 'verified', verifiedAt: '2026-11-04T16:00:00.000Z', attempts: 1, nameMatches: true, consentAt: '2026-11-04T15:55:00.000Z' },
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
  identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z', attempts: 2, nameMatches: true, consentAt: '2026-11-17T13:50:00.000Z' },
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
  actions: ['review_address', 'request_identity'],
};

/** Devon: a verified ID whose name differs from the account's. */
export const devonVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0207', verifiedAt: '2026-11-17T15:00:00.000Z' },
  agreement: { version: 'draft-0.1', acceptedAt: '2026-11-17T15:10:00.000Z' },
  identity: { status: 'verified', verifiedAt: '2026-11-18T14:00:00.000Z', attempts: 1, nameMatches: false, consentAt: '2026-11-18T13:55:00.000Z' },
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

/** A poster who never started helper onboarding. */
export const posterVerification: AdminPersonVerification = {
  phone: { verified: true, last4: '0101', verifiedAt: '2026-09-04T15:00:00.000Z' },
  identity: { status: 'not_started', attempts: 0 },
  address: { status: 'not_started', proofs: [] },
  payout: { status: 'not_started' },
  background: { status: 'not_required', requiredFor: [] },
  actions: [],
};

export const adminHomeVerifications = { counts: { address: 2, identity: 2, background: 1 }, oldestAt: '2026-11-15T16:00:00.000Z' };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminVerificationHandlers: AdminVerificationHandlers = {
  onRevealAddressProof: () => wait({ ok: true, address: '1234 Example Lane, Austin, TX 78723', document: { url: '/samples/proof-of-address.svg', kind: 'image' }, expiresAt: '2026-11-20T16:05:00.000Z' }),
  onDecideAddress: () => wait({ ok: true, code: 'updated' }),
  onVerificationAction: () => wait({ ok: true, code: 'updated' }),
};
