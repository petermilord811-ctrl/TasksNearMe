import { describe, expect, it } from 'vitest';
import { addressForLimits } from './client-address';

describe('the address rate limits count', () => {
  it('keeps an IPv4 address whole, also written as IPv6', () => {
    expect(addressForLimits('203.0.113.9')).toBe('203.0.113.9');
    expect(addressForLimits('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('counts an IPv6 address by its /64, however it is written', () => {
    const network = '2001:db8:85a3:8d3::/64';
    expect(addressForLimits('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(network);
    expect(addressForLimits('2001:0DB8:85a3:08d3::1')).toBe(network);
    expect(addressForLimits('[2001:db8:85a3:8d3:ffff::2]')).toBe(network);
    expect(addressForLimits('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressForLimits('64:ff9b::203.0.113.9')).toBe('64:ff9b:0:0::/64');
    expect(addressForLimits('2001:db8:85a3:8d4::1')).not.toBe(network);
  });
});
