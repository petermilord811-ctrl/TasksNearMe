import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

// findBy* and waitFor wait up to 3 s (default 1 s): checks often share the machine with dev servers.
configure({ asyncUtilTimeout: 3000 });

// After an action fails in a way a lost session explains, the UI asks /api/session whether it ended (bad connections
// pass, J-N2). In unit tests the answer is "signed in" unless a test says otherwise, so nothing reaches a real server.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('/api/session')) return new Response(JSON.stringify({ signedIn: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  return realFetch(input, init);
}) as typeof fetch;
