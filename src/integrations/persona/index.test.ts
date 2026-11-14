import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPersonaIdentity, parsePersonaEvent, PERSONA_API_VERSION, personaIdentityFromEnv, verifyPersonaSignature } from './index';

const secret = 'wbhsec_test_one';
const now = new Date('2026-11-20T16:00:00.000Z');
const t = Math.floor(now.getTime() / 1000);
const sign = (payload: string, key = secret, at = t) => `t=${at},v1=${createHmac('sha256', key).update(`${at}.${payload}`).digest('hex')}`;

/** A raw body as Persona sends it: its own spacing, which re-serializing would lose. */
const raw = '{"data": {"type": "event", "id": "evt_1", "attributes": {"name": "inquiry.approved", "created-at": "2026-11-20T15:59:58.000Z", "payload": {"data": {"type": "inquiry", "id": "inq_abc", "attributes": {"status": "approved"}}}}}}';

describe('Persona webhook signatures', () => {
  it('accepts a signature over the raw body, and any set while a secret rotates', () => {
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw), secret, now })).toBe(true);
    // Two sets, one per active secret: either one is enough.
    const rotating = `${sign(raw, 'wbhsec_old')} ${sign(raw, secret)}`;
    expect(verifyPersonaSignature({ payload: raw, header: rotating, secret, now })).toBe(true);
    expect(verifyPersonaSignature({ payload: raw, header: rotating, secret: 'wbhsec_old', now })).toBe(true);
  });

  it('refuses a bad signature, another secret, a missing header, or junk', () => {
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw, 'wbhsec_other'), secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: `t=${t},v1=deadbeef`, secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: `t=${t},v1=not-hex!`, secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: null, secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: 'v1=abc', secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw), secret: '', now })).toBe(false);
  });

  it('refuses an old (or far future) timestamp: 5 minutes at most', () => {
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw, secret, t - 299), secret, now })).toBe(true);
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw, secret, t - 301), secret, now })).toBe(false);
    expect(verifyPersonaSignature({ payload: raw, header: sign(raw, secret, t + 3600), secret, now })).toBe(false);
  });

  it('fails for a re-serialized body, even with the same data', () => {
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(reserialized).not.toBe(raw);
    expect(verifyPersonaSignature({ payload: reserialized, header: sign(raw), secret, now })).toBe(false);
  });
});

describe('Persona inquiries', () => {
  function fakeFetch(answer: unknown, status = 201) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(answer), { status, headers: { 'Content-Type': 'application/json' } }));
  }

  it('creates an inquiry from the template with a one-time link, coming back to the right page', async () => {
    const fetch = fakeFetch({ data: { type: 'inquiry', id: 'inq_123', attributes: { status: 'created' } }, meta: { 'one-time-link': 'https://withpersona.com/verify?code=abc', 'one-time-link-short': 'https://perso.na/abc' } });
    const persona = createPersonaIdentity({ apiKey: 'persona_sandbox_key', templateId: 'itmpl_test', appUrl: 'https://tasksnearme.test', fetch, now: () => now });
    await expect(persona.start('usr_priya', { returnPath: '/app/verify-identity?next=%2Fapp' })).resolves.toEqual({ sessionId: 'inq_123', url: 'https://withpersona.com/verify?code=abc' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.withpersona.com/api/v1/inquiries');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers).toMatchObject({ Authorization: 'Bearer persona_sandbox_key', 'Persona-Version': PERSONA_API_VERSION, 'Content-Type': 'application/json' });
    expect(headers['Idempotency-Key']).toBe(`inq-usr_priya-${Math.floor(now.getTime() / 60_000)}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      data: { attributes: { 'inquiry-template-id': 'itmpl_test', 'redirect-uri': 'https://tasksnearme.test/app/verify-identity?next=%2Fapp' } },
      meta: { 'auto-create-account-reference-id': 'usr_priya', 'auto-create-one-time-link': true },
    });
    // The helper's ID step by default.
    await persona.start('usr_priya');
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).data.attributes['redirect-uri']).toBe('https://tasksnearme.test/app/helper/onboarding/identity');
  });

  it('fails loudly without a link or on an error, and redacts with DELETE', async () => {
    await expect(createPersonaIdentity({ apiKey: 'k', templateId: 't', appUrl: '', fetch: fakeFetch({ data: { id: 'inq_1' }, meta: {} }) }).start('usr_a')).rejects.toThrow('no inquiry link');
    await expect(createPersonaIdentity({ apiKey: 'k', templateId: 't', appUrl: '', fetch: fakeFetch({ errors: [] }, 422) }).start('usr_a')).rejects.toThrow('422');
    const fetch = fakeFetch({ data: { id: 'inq_9' } }, 200);
    await createPersonaIdentity({ apiKey: 'k', templateId: 't', appUrl: '', fetch }).redact('inq_9');
    expect(fetch.mock.calls[0]![0]).toBe('https://api.withpersona.com/api/v1/inquiries/inq_9');
    expect(fetch.mock.calls[0]![1]?.method).toBe('DELETE');
  });

  it('reads an inquiry event: the status, the time, and the verified name and birth date from the ID', () => {
    const event = {
      data: {
        type: 'event',
        id: 'evt_2',
        attributes: {
          name: 'inquiry.approved',
          'created-at': '2026-11-20T15:59:58.000Z',
          payload: {
            data: { type: 'inquiry', id: 'inq_abc', attributes: { status: 'approved', fields: { 'name-first': { type: 'string', value: 'From Fields' } } } },
            included: [
              { type: 'template', id: 'itmpl_1', attributes: {} },
              { type: 'verification/government-id', id: 'ver_failed', attributes: { status: 'failed', 'name-first': 'Wrong' } },
              { type: 'verification/government-id', id: 'ver_ok', attributes: { status: 'passed', 'name-first': 'Priya', 'name-last': 'Shah', birthdate: '1994-03-02' } },
            ],
          },
        },
      },
    };
    expect(parsePersonaEvent(event)).toEqual({
      name: 'inquiry.approved',
      inquiryId: 'inq_abc',
      status: 'approved',
      createdAt: new Date('2026-11-20T15:59:58.000Z'),
      verified: { firstName: 'Priya', lastName: 'Shah', birthdate: '1994-03-02' },
    });
    expect(parsePersonaEvent(JSON.parse(raw))).toMatchObject({ inquiryId: 'inq_abc', status: 'approved' });
    expect(parsePersonaEvent(JSON.parse(raw))?.verified).toBeUndefined();
    // Other events, and broken ones, are ignored.
    expect(parsePersonaEvent({ data: { attributes: { name: 'account.created', 'created-at': '2026-11-20T15:59:58.000Z', payload: { data: { type: 'account', id: 'act_1', attributes: {} } } } } })).toBeNull();
    expect(parsePersonaEvent({ data: { attributes: { name: 'inquiry.approved', payload: { data: { type: 'inquiry', id: 'inq_1', attributes: { status: 'approved' } } } } } })).toBeNull();
    expect(parsePersonaEvent(null)).toBeNull();
  });

  it('is on only with the key, the template and the webhook secret', () => {
    const all = { PERSONA_API_KEY: 'k', PERSONA_INQUIRY_TEMPLATE_ID: 'itmpl_1', PERSONA_WEBHOOK_SECRET: 's' };
    expect(personaIdentityFromEnv(all)?.provider).toBe('persona');
    expect(personaIdentityFromEnv({ ...all, PERSONA_WEBHOOK_SECRET: '' })).toBeNull();
    expect(personaIdentityFromEnv({ ...all, PERSONA_INQUIRY_TEMPLATE_ID: undefined })).toBeNull();
    expect(personaIdentityFromEnv({})).toBeNull();
  });
});
