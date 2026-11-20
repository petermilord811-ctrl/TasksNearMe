import { describe, expect, it } from 'vitest';
import { isLocalRequest } from './local-request';

const request = (headers: Record<string, string>) => (name: string) => headers[name];

describe('isLocalRequest', () => {
  it('accepts a browser or test runner on this machine', () => {
    expect(isLocalRequest(request({ host: 'localhost:3000', 'x-forwarded-for': '::1' }))).toBe(true);
    expect(isLocalRequest(request({ host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'localhost:3000' }))).toBe(true);
    expect(isLocalRequest(request({ host: '[::1]:3000' }))).toBe(true);
  });

  it('refuses anything that came through the public proxy', () => {
    // Caddy passes the public host and the visitor's address.
    expect(isLocalRequest(request({ host: 'app.example.sslip.io', 'x-forwarded-for': '203.0.113.7' }))).toBe(false);
    // A visitor can't hide behind a loopback Host while the proxy adds their address.
    expect(isLocalRequest(request({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.7, 127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(request({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'app.example.sslip.io' }))).toBe(false);
    expect(isLocalRequest(request({ host: 'localhost.evil.test', 'x-forwarded-for': '127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(request({}))).toBe(false);
  });

  it('needs the request’s own Host: Next’s image sub-request has none, only forwarded headers Next filled (SEC23)', () => {
    expect(isLocalRequest(request({ 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'localhost' }))).toBe(false);
    expect(isLocalRequest(request({ 'x-forwarded-host': 'localhost:3000' }))).toBe(false);
  });
});
