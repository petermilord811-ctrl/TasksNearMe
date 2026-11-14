import { describe, expect, it } from 'vitest';
import { isRealRecordId } from './sample-data';

describe('isRealRecordId', () => {
  it('accepts ids the app generates', () => {
    expect(isRealRecordId('usr_0f4c9a1b2c3d4e5f60718293a4b5c6d7')).toBe(true);
    expect(isRealRecordId('tsk_ffffffffffffffffffffffffffffffff')).toBe(true);
  });

  it('rejects the demo marketplace and the base seed', () => {
    for (const id of ['tsk_demo_007', 'usr_demo_042', 'off_demo_007_sam', 'mkt_demo_chicago', 'usr_jordan', 'tsk_desk', 'mkt_austin']) {
      expect(isRealRecordId(id), id).toBe(false);
    }
  });

  it('rejects anything malformed', () => {
    for (const id of ['', 'usr_', 'USR_0f4c9a1b2c3d4e5f60718293a4b5c6d7', 'usr_0f4c9a1b2c3d4e5f60718293a4b5c6d', 'usr_0f4c9a1b2c3d4e5f60718293a4b5c6d7x']) {
      expect(isRealRecordId(id), id).toBe(false);
    }
  });
});
