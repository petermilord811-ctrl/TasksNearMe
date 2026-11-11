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
});
