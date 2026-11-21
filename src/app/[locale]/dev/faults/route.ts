import { currentFaults, FAULT_KINDS, setFault, type FaultKind } from '@/platform/faults';
import { devHelpersOn } from '@/shared/dev-helpers';
import { isLocalRequest } from '@/shared/local-request';

/**
 * Provider faults on purpose (when things break, 2026-11-21; src/platform/faults.ts): development and the e2e build
 * only, from this machine only (404 otherwise; src/proxy.ts checks too). GET shows them; POST
 * `{ kind: 'email' | 'sms' | 'payments', mode: 'down' | 'slow' | null }` sets or clears one; DELETE clears them all.
 */
const allowed = (request: Request) => devHelpersOn() && isLocalRequest((name) => request.headers.get(name));

export async function GET(request: Request) {
  if (!allowed(request)) return new Response('Not found', { status: 404 });
  return Response.json(currentFaults());
}

export async function POST(request: Request) {
  if (!allowed(request)) return new Response('Not found', { status: 404 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; mode?: unknown } | null;
  const kind = FAULT_KINDS.find((item) => item === body?.kind) as FaultKind | undefined;
  const mode = body?.mode === 'down' || body?.mode === 'slow' ? body.mode : body?.mode === null ? null : undefined;
  if (!kind || mode === undefined) return Response.json({ error: 'kind is email, sms or payments; mode is down, slow or null' }, { status: 400 });
  setFault(kind, mode);
  return Response.json(currentFaults());
}

export async function DELETE(request: Request) {
  if (!allowed(request)) return new Response('Not found', { status: 404 });
  for (const kind of FAULT_KINDS) setFault(kind, null);
  return Response.json(currentFaults());
}
