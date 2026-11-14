import { describe, expect, it } from 'vitest';
import { e2eStartProblem, listenHostname } from '@/platform/e2e-guard';

/**
 * The e2e build starts only when it serves this machine (src/platform/e2e-guard.ts, security review 5.18): APP_URL on
 * localhost and the server listening on loopback. `next start` without --hostname listens on every interface.
 */

const nextStart = ['/usr/bin/node', '/app/node_modules/next/dist/bin/next', 'start'];

describe('listenHostname', () => {
  it('reads --hostname and -H in every form `next start` accepts', () => {
    expect(listenHostname([...nextStart, '--hostname', 'localhost', '--port', '3300'], {})).toBe('localhost');
    expect(listenHostname([...nextStart, '--hostname=localhost'], {})).toBe('localhost');
    expect(listenHostname([...nextStart, '-H', '0.0.0.0'], {})).toBe('0.0.0.0');
    expect(listenHostname([...nextStart, '-H127.0.0.1'], {})).toBe('127.0.0.1');
  });

  it('is unset for `next start` without one, even with HOSTNAME set (next start ignores it)', () => {
    expect(listenHostname([...nextStart, '--port', '3300'], { HOSTNAME: 'localhost' })).toBeUndefined();
    expect(listenHostname(['/usr/bin/node', '/app/node_modules/.bin/next', 'start'], { HOSTNAME: 'localhost' })).toBeUndefined();
  });

  it('reads HOSTNAME for the standalone server.js', () => {
    expect(listenHostname(['/usr/bin/node', '/app/.next/standalone/server.js'], { HOSTNAME: 'localhost' })).toBe('localhost');
    expect(listenHostname(['/usr/bin/node', '/app/.next/standalone/server.js'], {})).toBeUndefined();
  });
});

describe('e2eStartProblem', () => {
  it('lets it start on localhost with a localhost APP_URL (npm run e2e:serve)', () => {
    expect(e2eStartProblem('http://localhost:3300', 'localhost')).toBeNull();
    expect(e2eStartProblem('http://localhost:3300', '127.0.0.1')).toBeNull();
    expect(e2eStartProblem('http://localhost:3300', '::1')).toBeNull();
  });

  it('refuses every interface, a public address, or no hostname at all', () => {
    expect(e2eStartProblem('http://localhost:3300', undefined)).toMatch(/every interface/);
    expect(e2eStartProblem('http://localhost:3300', '0.0.0.0')).toMatch(/--hostname localhost/);
    expect(e2eStartProblem('http://localhost:3300', '40.160.239.201')).toMatch(/this machine only/);
    expect(e2eStartProblem('http://localhost:3300', 'localhost.evil.example')).not.toBeNull();
  });

  it('still refuses an APP_URL that isn’t localhost', () => {
    expect(e2eStartProblem('https://tasksnearme.com', 'localhost')).toMatch(/APP_URL/);
    expect(e2eStartProblem(undefined, 'localhost')).toMatch(/APP_URL is unset/);
  });
});
