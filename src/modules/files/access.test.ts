import { describe, expect, it } from 'vitest';
import { canViewFile } from './access';

const photo = { kind: 'task_photo', ownerUserId: 'usr_maya' };
const sample = { kind: 'work_sample', ownerUserId: 'usr_sam' };

describe('file access', () => {
  it('shows task photos to their owner only: staff need a token from the page that shows them (SEC24)', () => {
    expect(canViewFile(photo, { userId: 'usr_maya' })).toBe(true);
    // Alex is on staff: nothing more here than anyone else.
    expect(canViewFile(photo, { userId: 'usr_alex' })).toBe(false);
    expect(canViewFile(photo, { userId: 'usr_jordan' })).toBe(false);
    expect(canViewFile(photo, { userId: null })).toBe(false);
  });

  it('shows work samples to everyone', () => {
    expect(canViewFile(sample, { userId: null })).toBe(true);
  });

  it('never serves a proof of address here, not to its owner or staff', () => {
    const proof = { kind: 'address_proof', ownerUserId: 'usr_priya' };
    expect(canViewFile(proof, { userId: 'usr_priya' })).toBe(false);
    expect(canViewFile(proof, { userId: 'usr_taylor' })).toBe(false);
  });

  it.each(['id_document', 'id_selfie'])('never serves an ID photo (%s) here, not to its owner or staff', (kind) => {
    const photo = { kind, ownerUserId: 'usr_priya' };
    expect(canViewFile(photo, { userId: 'usr_priya' })).toBe(false);
    expect(canViewFile(photo, { userId: 'usr_taylor' })).toBe(false);
    expect(canViewFile(photo, { userId: null })).toBe(false);
  });
});
