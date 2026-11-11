import { describe, expect, it } from 'vitest';
import { FAKE_PLACES } from '@/integrations/geocoding';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { distanceKm, fuzzedPublicPoint, inServiceArea, nearestArea } from './geo';

const austin = { centerLat: 30.2672, centerLng: -97.7431, serviceRadiusKm: 25 };
const areas = [
  { slug: 'mueller', centerLat: 30.2993, centerLng: -97.7036 },
  { slug: 'crestview', centerLat: 30.346, centerLng: -97.723 },
  { slug: 'circle-c', centerLat: 30.186, centerLng: -97.885 },
];
const place = (id: string) => FAKE_PLACES.find((p) => p.placeId === id)!;

describe('market geography', () => {
  it('measures distances', () => {
    expect(distanceKm({ lat: 30.2672, lng: -97.7431 }, { lat: 30.2993, lng: -97.7036 })).toBeCloseTo(5.2, 1);
  });

  it('keeps Austin addresses in and nearby towns out', () => {
    expect(inServiceArea(austin, place('plc_mueller_1234'))).toBe(true);
    expect(inServiceArea(austin, place('plc_circlec_510'))).toBe(true);
    expect(inServiceArea(austin, place('plc_roundrock_44'))).toBe(false);
    expect(inServiceArea(austin, place('plc_waco_100'))).toBe(false);
  });

  it('puts an address in its nearest area', () => {
    expect(nearestArea(areas, place('plc_mueller_1234'))?.slug).toBe('mueller');
    expect(nearestArea(areas, place('plc_crestview_88'))?.slug).toBe('crestview');
  });

  it('fuzzes the public point deterministically, within ~300 m of the area center', () => {
    const center = { lat: 30.2993, lng: -97.7036 };
    const a = fuzzedPublicPoint(center, 'tsk_1');
    expect(fuzzedPublicPoint(center, 'tsk_1')).toEqual(a);
    expect(fuzzedPublicPoint(center, 'tsk_2')).not.toEqual(a);
    expect(distanceKm(center, a)).toBeLessThanOrEqual(0.32);
  });
});

describe('field encryption', () => {
  const cipher = createFieldCipher(Buffer.alloc(32, 7).toString('base64'));

  it('round-trips and never repeats ciphertext', () => {
    const secret = JSON.stringify({ line1: '1234 Example Lane', accessNotes: 'Buzz 2B' });
    const a = cipher.encrypt(secret);
    expect(a).not.toContain('Example');
    expect(cipher.encrypt(secret)).not.toBe(a);
    expect(cipher.decrypt(a)).toBe(secret);
  });

  it('detects tampering and wrong keys', () => {
    const value = cipher.encrypt('hello');
    const [v, iv, tag, ct] = value.split('.');
    const flipped = `${ct!.slice(0, -1)}${ct!.endsWith('A') ? 'B' : 'A'}`;
    expect(() => cipher.decrypt([v, iv, tag, flipped].join('.'))).toThrow();
    expect(() => createFieldCipher(Buffer.alloc(32, 9).toString('base64')).decrypt(value)).toThrow();
    expect(() => createFieldCipher('short')).toThrow(/32 bytes/);
  });
});
