import { describe, expect, it } from 'vitest';
import type { IdDocumentReading } from '@/integrations/ai/id-document-reader';
import { idVerdict, type IdVerdictInput } from './id-verdict';

/** The automatic decision on our own ID check's photos, from a reading's checks. */

const clean: IdDocumentReading = {
  readable: true,
  source: 'barcode',
  frontAgrees: true,
  genuine: { outcome: 'pass', signals: ['number_derivation_ok'] },
  face: { faceMatch: 'pass', live: 'pass', signals: ['pose_followed'], photocopy: false, score: { similarity: 0.7, matchAt: 0.45, mismatchBelow: 0.3 }, liveness: 0.99 },
};
const input = (changes: Partial<IdVerdictInput> = {}, reading: Partial<IdDocumentReading> = {}): IdVerdictInput => ({
  reading: { ...clean, ...reading },
  answers: { nameMatches: true, isAdult: true, notExpired: true },
  duplicate: false,
  autoDecisions: true,
  ...changes,
});
const outcome = (verdict: ReturnType<typeof idVerdict>, key: string) => verdict.checks.find((check) => check.key === key)?.outcome;

describe('the ID verdict', () => {
  it('approves when all ten checks pass, and keeps the findings', () => {
    const verdict = idVerdict(input());
    expect(verdict.decision).toBe('approved');
    expect(verdict.checks.map((check) => check.key)).toEqual(['readable', 'machine_readable', 'genuine', 'front_matches', 'name', 'adult', 'not_expired', 'face_match', 'live', 'unique']);
    expect(verdict.checks.every((check) => check.outcome === 'pass')).toBe(true);
    expect(verdict.signals).toEqual(['number_derivation_ok', 'pose_followed']);
  });

  it('approves a passport read from its zone (its print confirms the names)', () => {
    expect(idVerdict(input({}, { source: 'mrz', frontAgrees: undefined, genuine: { outcome: 'pass', signals: ['mrz_check_digits_ok'] } })).decision).toBe('approved');
  });

  it('leaves anything unsure or failed to our team', () => {
    expect(idVerdict(input({}, { face: { ...clean.face!, faceMatch: 'unsure' } })).decision).toBe('review');
    expect(idVerdict(input({}, { face: { ...clean.face!, faceMatch: 'fail' } })).decision).toBe('review');
    expect(idVerdict(input({}, { genuine: { outcome: 'fail', signals: ['subfile_layout_off'] } })).decision).toBe('review');
    expect(idVerdict(input({ answers: { nameMatches: false, isAdult: true, notExpired: true } })).decision).toBe('review');
    expect(idVerdict(input({ duplicate: true })).decision).toBe('review');
    expect(idVerdict(input({ duplicate: undefined })).decision).toBe('review');
    expect(idVerdict(input({}, { face: undefined })).decision).toBe('review');
    // A license read from its print alone: nothing to cross-check.
    expect(idVerdict(input({}, { source: 'front', frontAgrees: undefined, genuine: { outcome: 'unsure', signals: ['barcode_missing'] } })).decision).toBe('review');
  });

  it("fails `genuine` for a black-and-white copy, whatever the barcode says", () => {
    const verdict = idVerdict(input({}, { face: { ...clean.face!, photocopy: true, signals: ['photocopy'] } }));
    expect(outcome(verdict, 'genuine')).toBe('fail');
    expect(verdict.decision).toBe('review');
  });

  it('turns down an expired ID or someone under 18, read by machine only', () => {
    expect(idVerdict(input({ answers: { nameMatches: true, isAdult: true, notExpired: false } }))).toMatchObject({ decision: 'rejected', rejectionReason: 'expired' });
    expect(idVerdict(input({ answers: { nameMatches: true, isAdult: false, notExpired: true } }))).toMatchObject({ decision: 'rejected', rejectionReason: 'under_18' });
    // Read from the print: our team looks first (OCR can misread a date).
    expect(idVerdict(input({ answers: { nameMatches: true, isAdult: true, notExpired: false } }, { source: 'front' })).decision).toBe('review');
  });

  it('decides nothing with automatic decisions off, keeping the checks', () => {
    const verdict = idVerdict(input({ autoDecisions: false }));
    expect(verdict.decision).toBe('review');
    expect(verdict.checks).toHaveLength(10);
  });

  it('fails `readable` for photos that could not be read, and leaves the rest unsure', () => {
    const verdict = idVerdict(input({ answers: {}, duplicate: undefined }, { readable: false, source: undefined, frontAgrees: undefined, genuine: undefined, face: undefined }));
    expect(outcome(verdict, 'readable')).toBe('fail');
    expect(verdict.checks.filter((check) => check.key !== 'readable').every((check) => check.outcome === 'unsure')).toBe(true);
    expect(verdict.decision).toBe('review');
  });
});
