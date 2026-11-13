import { describe, expect, it } from 'vitest';
import { staffCheckIsStrict } from './staff-dev-code';

const local = (name: string) => ({ host: 'localhost:3000', 'x-forwarded-for': '::1' } as Record<string, string>)[name];
const publicProxy = (name: string) => ({ host: 'app.example.sslip.io', 'x-forwarded-for': '203.0.113.7' } as Record<string, string>)[name];

describe('the staff development code (123456)', () => {
  it('works on a dev server only for requests made on this machine', () => {
    expect(staffCheckIsStrict('development', local)).toBe(false);
    expect(staffCheckIsStrict('development', publicProxy)).toBe(true);
    expect(staffCheckIsStrict('test', publicProxy)).toBe(true);
  });

  it('never works in production', () => {
    expect(staffCheckIsStrict('production', local)).toBe(true);
    expect(staffCheckIsStrict('production', publicProxy)).toBe(true);
  });
});
