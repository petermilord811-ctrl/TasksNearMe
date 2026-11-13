import { describe, expect, it } from 'vitest';
import { canViewFile } from './access';

const photo = { kind: 'task_photo', ownerUserId: 'usr_maya' };
const sample = { kind: 'work_sample', ownerUserId: 'usr_sam' };

describe('file access', () => {
  it('shows task photos to their owner and staff only', () => {
    expect(canViewFile(photo, { userId: 'usr_maya', isStaff: false })).toBe(true);
    expect(canViewFile(photo, { userId: 'usr_alex', isStaff: true })).toBe(true);
    expect(canViewFile(photo, { userId: 'usr_jordan', isStaff: false })).toBe(false);
    expect(canViewFile(photo, { userId: null, isStaff: false })).toBe(false);
  });

  it('shows work samples to everyone', () => {
    expect(canViewFile(sample, { userId: null, isStaff: false })).toBe(true);
  });

  it('never serves a proof of address here, not to its owner or staff', () => {
    const proof = { kind: 'address_proof', ownerUserId: 'usr_priya' };
    expect(canViewFile(proof, { userId: 'usr_priya', isStaff: false })).toBe(false);
    expect(canViewFile(proof, { userId: 'usr_taylor', isStaff: true })).toBe(false);
  });

  it.each(['id_document', 'id_selfie'])('never serves an ID photo (%s) here, not to its owner or staff', (kind) => {
    const photo = { kind, ownerUserId: 'usr_priya' };
    expect(canViewFile(photo, { userId: 'usr_priya', isStaff: false })).toBe(false);
    expect(canViewFile(photo, { userId: 'usr_taylor', isStaff: true })).toBe(false);
    expect(canViewFile(photo, { userId: null, isStaff: false })).toBe(false);
  });
});
