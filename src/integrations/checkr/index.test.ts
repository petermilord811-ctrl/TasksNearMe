import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkrFromEnv, createCheckr, parseCheckrEvent, verifyCheckrSignature } from './index';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Checkr', () => {
  it('makes a candidate and an invitation for where the person works, and returns the hosted invitation', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith('/candidates') ? json({ id: 'cand_1' }) : json({ id: 'inv_1', invitation_url: 'https://apply.checkr.com/invite/abc', status: 'pending' })));
    const checkr = createCheckr({ apiKey: 'key_test', packageSlug: 'tasker_standard', fetch: fetcher as unknown as typeof fetch });
    expect(await checkr.start({ userId: 'usr_jordan', email: 'jordan@example.test', firstName: 'Jordan', lastName: 'Thompson', workLocation: { state: 'FL', city: 'Gainesville' } })).toEqual({ ref: 'cand_1', url: 'https://apply.checkr.com/invite/abc' });
    const [[candidateUrl, candidateInit], [invitationUrl, invitationInit]] = fetcher.mock.calls as [string, RequestInit][];
    expect(candidateUrl).toBe('https://api.checkr.com/v1/candidates');
    expect(candidateInit.headers).toMatchObject({ Authorization: `Basic ${Buffer.from('key_test:').toString('base64')}`, 'Content-Type': 'application/json' });
    const location = [{ country: 'US', state: 'FL', city: 'Gainesville' }];
    expect(JSON.parse(String(candidateInit.body))).toEqual({ email: 'jordan@example.test', first_name: 'Jordan', last_name: 'Thompson', custom_id: 'usr_jordan', work_locations: location });
    expect(invitationUrl).toBe('https://api.checkr.com/v1/invitations');
    expect(JSON.parse(String(invitationInit.body))).toEqual({ candidate_id: 'cand_1', package: 'tasker_standard', work_locations: location });
  });

  it('leaves the city out when only the state is known', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith('/candidates') ? json({ id: 'cand_2' }) : json({ id: 'inv_2', invitation_url: 'https://apply.checkr.com/invite/def' })));
    const checkr = createCheckr({ apiKey: 'key_test', packageSlug: 'tasker_standard', fetch: fetcher as unknown as typeof fetch });
    await checkr.start({ userId: 'usr_sam', email: 'sam@example.test', firstName: 'Sam', lastName: 'Kim', workLocation: { state: 'WA', city: null } });
    for (const [, init] of fetcher.mock.calls as [string, RequestInit][]) expect(JSON.parse(String(init.body)).work_locations).toEqual([{ country: 'US', state: 'WA' }]);
  });

  it('sends the pre-adverse notice on the latest report with every adverse item, and can cancel the final one', async () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/candidates/cand_1')) return json({ id: 'cand_1', report_ids: ['rep_old', 'rep_new'] });
      if (url.endsWith('/reports/rep_new/adverse_items')) return json({ object: 'list', data: [{ id: 'ai_1' }, { id: 'ai_2' }] });
      if (url.endsWith('/reports/rep_new/adverse_actions')) return json({ id: 'aa_1', status: 'pending' });
      return new Response(null, { status: 204 });
    });
    const checkr = createCheckr({ apiKey: 'key_test', packageSlug: 'p', fetch: fetcher as unknown as typeof fetch, now: () => now });
    expect(await checkr.preAdverseAction('cand_1')).toBe('aa_1');
    const create = fetcher.mock.calls.find(([url]) => url.endsWith('/adverse_actions'))!;
    expect(JSON.parse(String(create[1]?.body))).toEqual({ adverse_item_ids: ['ai_1', 'ai_2'], post_notice_scheduled_at: '2026-11-24T15:00:00.000Z' });
    await checkr.cancelAdverseAction('aa_1');
    expect(fetcher.mock.calls.at(-1)).toEqual(['https://api.checkr.com/v1/adverse_actions/aa_1', expect.objectContaining({ method: 'DELETE' })]);
  });

  it('accepts only webhooks signed with the API key', () => {
    const payload = '{"type":"report.completed","data":{"object":{"candidate_id":"cand_1","status":"clear"}}}';
    const header = createHmac('sha256', 'key_test').update(payload).digest('hex');
    expect(verifyCheckrSignature({ payload, header, apiKey: 'key_test' })).toBe(true);
    expect(verifyCheckrSignature({ payload, header, apiKey: 'key_other' })).toBe(false);
    expect(verifyCheckrSignature({ payload: payload.replace('clear', 'consider'), header, apiKey: 'key_test' })).toBe(false);
    expect(verifyCheckrSignature({ payload, header: 'not-a-hash', apiKey: 'key_test' })).toBe(false);
    expect(verifyCheckrSignature({ payload, header: null, apiKey: 'key_test' })).toBe(false);
  });

  it('reads the outcome from the events, by candidate', () => {
    const event = (type: string, object: Record<string, unknown> = {}) => ({ type, data: { object: { candidate_id: 'cand_1', ...object } } });
    expect(parseCheckrEvent(event('invitation.completed'))).toEqual({ ref: 'cand_1', status: 'pending' });
    expect(parseCheckrEvent(event('invitation.expired'))).toEqual({ ref: 'cand_1', status: 'canceled' });
    expect(parseCheckrEvent(event('report.completed', { status: 'complete', result: 'consider' }))).toEqual({ ref: 'cand_1', status: 'consider' });
    expect(parseCheckrEvent(event('report.completed', { status: 'clear' }))).toEqual({ ref: 'cand_1', status: 'clear' });
    expect(parseCheckrEvent(event('report.suspended'))).toEqual({ ref: 'cand_1', status: 'suspended' });
    expect(parseCheckrEvent(event('report.engaged'))).toBeNull();
    expect(parseCheckrEvent({ type: 'report.completed', data: { object: {} } })).toBeNull();
  });

  it('is on with an API key and a package', () => {
    expect(checkrFromEnv({ CHECKR_API_KEY: 'k' })).toBeNull();
    expect(checkrFromEnv({ CHECKR_API_KEY: 'k', CHECKR_PACKAGE: 'p' })?.provider).toBe('checkr');
  });
});
