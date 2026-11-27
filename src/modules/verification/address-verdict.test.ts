import { describe, expect, it } from 'vitest';
import type { AddressDocumentReading } from '@/integrations/ai/document-reader';
import { addressVerdict } from './address-verdict';

const clean: AddressDocumentReading = {
  readable: true,
  documentType: 'utility_bill',
  nameMatches: true,
  addressMatches: true,
  recent: true,
  issuer: { name: 'Gainesville Regional Utilities', kind: 'utility_bill' },
  documentDate: '2026-10-31',
  textSource: 'pdf',
  confident: true,
  unedited: 'pass',
  signals: ['issuer_known', 'name_near_address', 'address_in_header'],
};
const outcomes = (reading: AddressDocumentReading) => Object.fromEntries(addressVerdict(reading).checks.map((check) => [check.key, check.outcome]));

describe('the automatic decision on a proof of address', () => {
  it('approves a clean, confident reading where every check passes, in the contract order', () => {
    const verdict = addressVerdict(clean);
    expect(verdict.decision).toBe('approved');
    expect(verdict.checks.map((check) => check.key)).toEqual(['readable', 'accepted_kind', 'name', 'address', 'recent', 'unedited']);
    expect(verdict.checks.every((check) => check.outcome === 'pass')).toBe(true);
    // A photo read with confidence, with nothing to show it was edited.
    expect(addressVerdict({ ...clean, textSource: 'photo', unedited: 'pass', signals: ['photo'] }).decision).toBe('approved');
  });

  it('turns down only an old document read with confidence', () => {
    expect(addressVerdict({ ...clean, recent: false })).toMatchObject({ decision: 'rejected', rejectionReason: 'too_old' });
    expect(addressVerdict({ ...clean, recent: false, unedited: 'fail', nameMatches: false }).decision).toBe('rejected');
    // A shaky reading's "old" is for staff.
    expect(addressVerdict({ ...clean, recent: false, confident: false }).decision).toBe('review');
  });

  it('leaves everything else to staff', () => {
    for (const reading of [
      { ...clean, confident: false },
      { ...clean, confident: undefined },
      { ...clean, nameMatches: false },
      { ...clean, nameMatches: undefined },
      { ...clean, addressMatches: false },
      { ...clean, recent: undefined },
      { ...clean, unedited: 'fail' as const },
      { ...clean, unedited: 'unsure' as const },
      { ...clean, unedited: undefined },
      { ...clean, documentType: 'other' as const },
      { ...clean, documentType: undefined },
    ]) {
      expect(addressVerdict(reading).decision, JSON.stringify(reading)).toBe('review');
    }
  });

  it('says what each check found', () => {
    expect(outcomes({ ...clean, nameMatches: false, recent: undefined, unedited: 'fail' })).toEqual({ readable: 'pass', accepted_kind: 'pass', name: 'fail', address: 'pass', recent: 'unsure', unedited: 'fail' });
    // "Other" fails on confident text, and is only unsure on a shaky reading.
    expect(outcomes({ ...clean, documentType: 'other' }).accepted_kind).toBe('fail');
    expect(outcomes({ ...clean, documentType: 'other', confident: false }).accepted_kind).toBe('unsure');
  });

  it("says nothing more about a document that didn't read", () => {
    const verdict = addressVerdict({ readable: false, textSource: 'pdf', signals: ['scanned_pdf'] });
    expect(verdict.decision).toBe('review');
    expect(outcomes({ readable: false })).toEqual({ readable: 'fail', accepted_kind: 'unsure', name: 'unsure', address: 'unsure', recent: 'unsure', unedited: 'unsure' });
  });

  it("leaves test accounts' stand-in reading to staff", () => {
    expect(addressVerdict({ readable: true, documentType: 'utility_bill' })).toMatchObject({ decision: 'review' });
    expect(outcomes({ readable: true, documentType: 'utility_bill' })).toEqual({ readable: 'pass', accepted_kind: 'pass', name: 'unsure', address: 'unsure', recent: 'unsure', unedited: 'unsure' });
  });
});
