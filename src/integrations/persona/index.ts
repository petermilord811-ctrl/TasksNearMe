import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Persona, the provider's double check after our own ID check (stage 2; completion plan 6.2, the owner's
 * choice; blueprint 06 F15 named it as the fallback). Written against Persona's REST API, without an SDK:
 * an inquiry from the template (`PERSONA_INQUIRY_TEMPLATE_ID`), opened through its one-time link, and the
 * results at /api/webhooks/persona, signed with `PERSONA_WEBHOOK_SECRET`. Only the status, whether the
 * verified name matches and whether the person is 18 or older come back into the app; the name and birth
 * date are read once and never stored (docs/integration-points.md).
 */

const API = 'https://api.withpersona.com/api/v1';
/** The API version every request pins (Persona's current one when this was written). */
export const PERSONA_API_VERSION = '2026-09-29';

export interface PersonaIdentity {
  readonly provider: 'persona';
  /** Creates an inquiry for the person and returns its id (inq_…) and one-time link; it comes back to `returnPath`. */
  start(userId: string, options?: { returnPath?: string }): Promise<{ sessionId: string; url: string }>;
  /** Asks Persona to delete the inquiry's personal data (Texas biometric limits, blueprint 06 §3). */
  redact(sessionId: string): Promise<void>;
}

export function createPersonaIdentity(config: { apiKey: string; templateId: string; appUrl: string; fetch?: typeof fetch; now?: () => Date }): PersonaIdentity {
  const doFetch = config.fetch ?? fetch;
  async function call(method: 'POST' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string) {
    const response = await doFetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Persona-Version': PERSONA_API_VERSION,
        'Key-Inflection': 'kebab',
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Persona answered ${response.status}`);
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  }
  return {
    provider: 'persona',
    async start(userId, options = {}) {
      // A double tap within the same minute opens one inquiry.
      const minute = Math.floor((config.now?.() ?? new Date()).getTime() / 60_000);
      const answer = await call(
        'POST',
        '/inquiries',
        {
          data: { attributes: { 'inquiry-template-id': config.templateId, 'redirect-uri': `${config.appUrl}${options.returnPath ?? '/app/helper/onboarding/identity'}` } },
          meta: { 'auto-create-account-reference-id': userId, 'auto-create-one-time-link': true },
        },
        `inq-${userId}-${minute}`,
      );
      const data = answer.data as { id?: unknown } | undefined;
      const meta = answer.meta as Record<string, unknown> | undefined;
      const link = meta?.['one-time-link'];
      if (typeof data?.id !== 'string' || typeof link !== 'string') throw new Error('Persona sent no inquiry link');
      return { sessionId: data.id, url: link };
    },
    async redact(sessionId) {
      await call('DELETE', `/inquiries/${encodeURIComponent(sessionId)}`);
    },
  };
}

/**
 * A Persona webhook's `Persona-Signature` header: one or more space-separated sets of `t=<unix>,v1=<hex>`
 * (two while a secret rotates). Each `v1` is an HMAC-SHA256 of `t.<raw body>` with the endpoint secret; the
 * request is genuine if any set matches (compared in constant time) and its time is within 5 minutes.
 */
export function verifyPersonaSignature(input: { payload: string; header: string | null; secret: string; now: Date; toleranceSeconds?: number }): boolean {
  if (!input.header || !input.secret) return false;
  const tolerance = input.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  return input.header
    .trim()
    .split(/\s+/)
    .some((set) => {
      const pairs = set.split(',').map((part) => {
        const at = part.indexOf('=');
        return at < 0 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
      });
      const timestamp = pairs.find(([key]) => key === 't')?.[1];
      const signatures = pairs.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
      if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
      if (tolerance <= 0 || Math.abs(nowSeconds - Number(timestamp)) > tolerance) return false;
      const expected = createHmac('sha256', input.secret).update(`${timestamp}.${input.payload}`).digest();
      return signatures.some((signature) => {
        if (!/^[0-9a-f]+$/i.test(signature)) return false;
        const given = Buffer.from(signature, 'hex');
        return given.length === expected.length && timingSafeEqual(given, expected);
      });
    });
}

/** An inquiry event the app acts on: which inquiry, its status then, when the event was made, and what was verified. */
export interface PersonaInquiryEvent {
  name: string;
  inquiryId: string;
  status: string;
  createdAt: Date;
  /** From the inquiry's government ID verification, when it passed: compared and checked, never stored. */
  verified?: { firstName?: string; lastName?: string; birthdate?: string };
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The verified name and birth date: the passed government ID verification first, then the inquiry's fields. */
function verifiedOf(payload: { data?: { attributes?: Record<string, unknown> }; included?: unknown[] }): PersonaInquiryEvent['verified'] {
  const government = (payload.included ?? []).find((item): item is { type: string; attributes: Record<string, unknown> } => {
    const object = item as { type?: unknown; attributes?: { status?: unknown } } | null;
    return typeof object?.type === 'string' && object.type.startsWith('verification/government-id') && object.attributes?.status === 'passed';
  });
  const fields = (payload.data?.attributes?.fields ?? {}) as Record<string, { value?: unknown } | undefined>;
  const firstName = text(government?.attributes['name-first']) ?? text(fields['name-first']?.value);
  const lastName = text(government?.attributes['name-last']) ?? text(fields['name-last']?.value);
  const birthdate = text(government?.attributes.birthdate) ?? text(fields.birthdate?.value);
  return firstName || lastName || birthdate ? { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), ...(birthdate ? { birthdate } : {}) } : undefined;
}

/** The inquiry events (`inquiry.*`); others are acknowledged and ignored. */
export function parsePersonaEvent(event: unknown): PersonaInquiryEvent | null {
  const data = (event as { data?: { attributes?: Record<string, unknown> } } | null)?.data;
  const attributes = data?.attributes;
  const name = attributes?.name;
  const payload = attributes?.payload as { data?: { type?: unknown; id?: unknown; attributes?: Record<string, unknown> }; included?: unknown[] } | undefined;
  const inquiry = payload?.data;
  const createdAt = new Date(String(attributes?.['created-at'] ?? ''));
  if (typeof name !== 'string' || !name.startsWith('inquiry.') || inquiry?.type !== 'inquiry' || typeof inquiry.id !== 'string') return null;
  const status = inquiry.attributes?.status;
  if (typeof status !== 'string' || Number.isNaN(createdAt.getTime())) return null;
  const verified = verifiedOf(payload!);
  return { name, inquiryId: inquiry.id, status, createdAt, ...(verified ? { verified } : {}) };
}

/** Persona when all three are set: the API key, the inquiry template and the webhook secret. */
export function personaIdentityFromEnv(env: Record<string, string | undefined> = process.env): PersonaIdentity | null {
  const apiKey = env.PERSONA_API_KEY?.trim();
  const templateId = env.PERSONA_INQUIRY_TEMPLATE_ID?.trim();
  const secret = env.PERSONA_WEBHOOK_SECRET?.trim();
  if (!apiKey || !templateId || !secret) return null;
  const appUrl = (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return createPersonaIdentity({ apiKey, templateId, appUrl });
}
