import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts';
import { createPersonaIdentity } from '@/integrations/persona';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { supportCases } from '@/modules/support/schema';
import { files } from '@/modules/tasks/schema';
import { startPosterIdentity } from '@/modules/verification/poster-identity';
import { createDevVerificationProviders, type VerificationProviders } from '@/modules/verification/providers';
import { identityCaptures, identityVerifications } from '@/modules/verification/schema';
import { getAdminVerificationsPage, getPersonVerification, verificationAction } from '@/modules/verification/staff';
import { captureSummary, loadOnboardingState } from '@/modules/verification/state';
import { runVerificationTimers } from '@/modules/verification/timers';
import { startIdentity } from '@/modules/verification/tracks';
import { handlePersonaWebhook } from '@/modules/verification/webhooks';
import { receiveWebhook, replayWebhook } from '@/modules/webhooks/inbox';
import { webhookEvents } from '@/modules/webhooks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Persona as the ID check's double check (completion plan 6.2): the inquiry it opens, its signed events
 * through the real recorders (in any order, and twice), the case staff get when it doesn't confirm the
 * photos our team approved; the photos stay a year after our decision (2026-11-27). Persona itself is a fake
 * fetch; nothing leaves the machine.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const SECRET = 'wbhsec_test_persona';
const root = path.join(os.tmpdir(), `tnm-persona-${process.pid}`);
const storage = createLocalFileStorage(root);
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const alex = { id: 'usr_alex', roles: ['support_agent' as const] };
const APPROVED = 'usr_pa_approved';
const DECLINED = 'usr_pa_declined';
const RETRY = 'usr_pa_retry';
const CLIENT = 'usr_pa_client';
const INBOX = 'usr_pa_inbox';
const PEOPLE = [APPROVED, DECLINED, RETRY, CLIENT, INBOX];
const t0 = new Date('2026-11-20T16:00:00.000Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

// Persona's API, faked: each inquiry gets the next id and a one-time link.
let inquiries = 0;
const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
  inquiries += 1;
  return Response.json({ data: { type: 'inquiry', id: `inq_pa_${inquiries}`, attributes: { status: 'created' } }, meta: { 'one-time-link': `https://withpersona.com/verify?code=pa${inquiries}` } }, { status: 201 });
});
const providers: VerificationProviders = {
  ...createDevVerificationProviders(),
  identity: createPersonaIdentity({ apiKey: 'persona_sandbox_key', templateId: 'itmpl_test', appUrl: 'https://tasksnearme.test', fetch }),
};

/** A signed Persona event about an inquiry, made at `made` and received at `received` (signed then). */
function personaEvent(name: string, inquiryId: string, status: string, made: Date, received = made, included: unknown[] = []) {
  const payload = JSON.stringify({
    data: { type: 'event', id: `evt_${name}_${made.getTime()}`, attributes: { name, 'created-at': made.toISOString(), payload: { data: { type: 'inquiry', id: inquiryId, attributes: { status } }, included } } },
  });
  const t = Math.floor(received.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`, secret: SECRET };
}
/** The government ID verification Persona includes with an approved inquiry. */
const governmentId = (birthdate = '1990-05-01', firstName = 'Vera', lastName = 'Tester') => ({ type: 'verification/government-id', id: 'ver_pa', attributes: { status: 'passed', 'name-first': firstName, 'name-last': lastName, birthdate } });
const minutes = (date: Date, count: number) => new Date(date.getTime() + count * 60_000);

/** A helper up to the ID step: the basics, the agreement and a verified phone. */
async function helper(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.test`, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+1512555${String(PEOPLE.indexOf(id)).padStart(2, '0')}88`, phoneVerifiedAt: at(-30), createdAt: at(-30) });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [yard] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: yard!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, at(-30));
}

/** Our own check's photos (stage 1), stored and approved by our team: the double check can open. */
async function photosApproved(id: string, when: Date) {
  const kinds = [['front', 'id_document'], ['back', 'id_document'], ['selfie', 'id_selfie']] as const;
  const ids: Record<string, string> = {};
  for (const [side, kind] of kinds) {
    const fileId = `fil_${id}_${side}`;
    await storage.put(`identity/${fileId}.bin`, Buffer.from('sealed photo'), 'application/octet-stream');
    await db.insert(files).values({ id: fileId, ownerUserId: id, kind, storageKey: `identity/${fileId}.bin`, contentType: 'image/jpeg', width: 1200, height: 800, bytes: 12 });
    ids[side] = fileId;
  }
  await db.insert(identityCaptures).values({
    id: `idc_${id}`,
    userId: id,
    documentType: 'state_id',
    frontFileId: ids.front,
    backFileId: ids.back,
    selfieFileId: ids.selfie,
    promptKey: 'smile',
    status: 'approved',
    submittedAt: minutes(when, -30),
    decidedAt: when,
    decidedByUserId: taylor.id,
    createdAt: minutes(when, -30),
    updatedAt: when,
  });
}

const sessionOf = async (inquiryId: string) => (await db.select().from(identityVerifications).where(eq(identityVerifications.providerSessionId, inquiryId)))[0]!;
const captureOf = async (id: string) => (await db.select().from(identityCaptures).where(eq(identityCaptures.userId, id)))[0]!;
const identityEvents = async (id: string) =>
  (await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, id))))
    .map((row) => row.payload)
    .filter((payload) => payload.track === 'identity' || payload.track === 'poster_identity');
const stored = async (key: string) => (await storage.get(key)) !== null;

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterAll(async () => {
  // Their verification events too: a later dispatch would try to notify these throwaway people.
  await db.delete(outboxEvents).where(or(inArray(outboxEvents.aggregateId, PEOPLE), sql`${outboxEvents.payload}::text like ${'%usr_pa_%'}`));
  await db.delete(supportCases).where(eq(supportCases.subjectUserId, CLIENT));
  await db.delete(webhookEvents).where(eq(webhookEvents.provider, 'persona'));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('Persona, the double check', () => {
  it('opens an inquiry from the template once our team approved the photos, coming back to the ID step', async () => {
    await helper(APPROVED);
    expect(await startIdentity(db, providers, APPROVED, at(0), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    expect(fetch).not.toHaveBeenCalled();
    await photosApproved(APPROVED, at(-0.1));
    expect(await startIdentity(db, providers, APPROVED, at(0), { consent: true })).toEqual({ ok: true, code: 'updated', redirectTo: 'https://withpersona.com/verify?code=pa1' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.withpersona.com/api/v1/inquiries');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer persona_sandbox_key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      data: { attributes: { 'inquiry-template-id': 'itmpl_test', 'redirect-uri': `https://tasksnearme.test${routes.app.helperOnboarding('identity')}` } },
      // Only our id goes to Persona; the person enters everything else on Persona's page.
      meta: { 'auto-create-account-reference-id': APPROVED, 'auto-create-one-time-link': true },
    });
    expect(await sessionOf('inq_pa_1')).toMatchObject({ userId: APPROVED, provider: 'persona', status: 'processing' });
  });

  it('verifies on approval with the matching name, applies events once and in order, then deletes our photos', async () => {
    const started = at(0);
    expect(await handlePersonaWebhook(db, personaEvent('inquiry.completed', 'inq_pa_1', 'completed', minutes(started, 4)), minutes(started, 4))).toEqual({ status: 200, body: { ok: true } });
    expect(await sessionOf('inq_pa_1')).toMatchObject({ status: 'processing', providerOutcome: 'completed' });
    const approved = personaEvent('inquiry.approved', 'inq_pa_1', 'approved', minutes(started, 5), minutes(started, 5), [governmentId()]);
    expect(await handlePersonaWebhook(db, approved, minutes(started, 5))).toEqual({ status: 200, body: { ok: true } });
    expect(await sessionOf('inq_pa_1')).toMatchObject({ status: 'verified', isAdult: true, nameMatches: true, providerOutcome: 'approved' });

    // Persona sends it again, and an older event arrives late: neither changes anything.
    expect(await handlePersonaWebhook(db, approved, minutes(started, 6))).toEqual({ status: 200, body: { ok: true } });
    expect(await handlePersonaWebhook(db, personaEvent('inquiry.completed', 'inq_pa_1', 'completed', minutes(started, 4.5), minutes(started, 7)), minutes(started, 7))).toEqual({ status: 200, body: { ok: true } });
    expect(await sessionOf('inq_pa_1')).toMatchObject({ status: 'verified', providerOutcome: 'approved' });
    expect((await identityEvents(APPROVED)).filter((payload) => payload.outcome === 'passed')).toHaveLength(1);

    const state = await loadOnboardingState(db, APPROVED, minutes(started, 7));
    expect(state.identity).toMatchObject({ verified: true, cleared: true });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, APPROVED));
    expect(profile!.idVerifiedAt).not.toBeNull();

    // Both stages final, the photos stay for our team's review until a year after our decision (owner, 2026-11-27).
    expect(await stored(`identity/fil_${APPROVED}_selfie.bin`)).toBe(true);
    await runVerificationTimers(db, { storage, providers }, minutes(started, 8), { userIds: PEOPLE });
    const capture = await captureOf(APPROVED);
    expect(capture).toMatchObject({ status: 'approved' });
    expect(capture.filesDeletedAt).toBeNull();
    expect(await stored(`identity/fil_${APPROVED}_selfie.bin`)).toBe(true);
  });

  it('pauses the helper when Persona declines the ID our team approved, with a case showing both results', async () => {
    await helper(DECLINED);
    await photosApproved(DECLINED, at(1));
    const start = await startIdentity(db, providers, DECLINED, at(1.01), { consent: true });
    expect(start).toMatchObject({ ok: true, redirectTo: 'https://withpersona.com/verify?code=pa2' });
    const declinedAt = minutes(at(1.01), 6);
    expect(await handlePersonaWebhook(db, personaEvent('inquiry.declined', 'inq_pa_2', 'declined', declinedAt), declinedAt)).toEqual({ status: 200, body: { ok: true } });
    expect(await sessionOf('inq_pa_2')).toMatchObject({ status: 'requires_input', providerOutcome: 'declined', reviewOutcome: null });

    // Late and newer progress updates don't undo the decision.
    await handlePersonaWebhook(db, personaEvent('inquiry.completed', 'inq_pa_2', 'completed', minutes(declinedAt, -1), minutes(declinedAt, 1)), minutes(declinedAt, 1));
    await handlePersonaWebhook(db, personaEvent('inquiry.marked-for-review', 'inq_pa_2', 'needs_review', minutes(declinedAt, 2)), minutes(declinedAt, 2));
    expect(await sessionOf('inq_pa_2')).toMatchObject({ status: 'requires_input', providerOutcome: 'declined' });

    const now = minutes(declinedAt, 3);
    const state = await loadOnboardingState(db, DECLINED, now);
    expect(state.identity).toMatchObject({ blocked: 'double_check_review', canStart: false, canCapture: false, captureApproved: true });
    expect(await startIdentity(db, providers, DECLINED, now, { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, DECLINED));
    expect(profile!.idVerifiedAt).toBeNull();
    expect((await identityEvents(DECLINED)).map((payload) => payload.outcome)).toEqual(['action_needed']);

    // Staff see both: when our team approved, and what Persona said.
    const queue = await getAdminVerificationsPage(db, taylor, 'identity', now);
    expect(queue.identity.find((row) => row.person.id === DECLINED)).toMatchObject({
      kind: 'double_check',
      attempts: 2,
      doubleCheck: { approvedAt: at(1).toISOString(), providerOutcome: 'declined', endedAt: declinedAt.toISOString() },
    });
    const view = await getPersonVerification(db, taylor, DECLINED, now);
    expect(view.identity).toMatchObject({ status: 'requires_input', blocked: 'double_check_review', providerOutcome: 'declined' });
    expect(view.identity.captures[0]).toMatchObject({ status: 'approved', decidedAt: at(1).toISOString() });
    expect(view.actions).toEqual(expect.arrayContaining(['allow_double_check_retry', 'reject_double_check']));
    expect(view.actions).not.toContain('allow_identity_retry');

    // Undecided, the photos stay for staff (the 30-day timer is the backstop).
    await runVerificationTimers(db, { storage, providers }, now, { userIds: PEOPLE });
    expect((await captureOf(DECLINED)).frontFileId).not.toBeNull();
  });

  it('lets staff turn the approved photos down, with a note, and the helper takes new ones', async () => {
    const now = at(1.2);
    const input = { userId: DECLINED, action: 'reject_double_check' as const, note: 'The ID number fails the state check; ask for a current ID.' };
    expect(await verificationAction(db, providers, alex, input, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await verificationAction(db, providers, taylor, input, now)).toEqual({ ok: true, code: 'updated' });
    expect(await captureOf(DECLINED)).toMatchObject({ status: 'rejected', rejectionReason: 'double_check_failed', decidedByUserId: taylor.id, staffNote: input.note });
    expect(await sessionOf('inq_pa_2')).toMatchObject({ reviewOutcome: 'rejected', reviewedByUserId: taylor.id });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, DECLINED), eq(auditLog.action, 'verification.reject_double_check')));
    expect(audit).toMatchObject({ actorId: taylor.id, reason: input.note });
    expect(audit!.metadata).toMatchObject({ providerOutcome: 'declined', captureId: `idc_${DECLINED}`, approvedAt: at(1).toISOString() });

    const state = await loadOnboardingState(db, DECLINED, now);
    expect(state.identity.blocked).toBeUndefined();
    expect(state.identity).toMatchObject({ captureApproved: false, canCapture: true });
    expect(captureSummary(state, 'prompt-secret')).toMatchObject({ stage: 'needed', rejectionReason: 'double_check_failed', canSubmit: true });
    expect((await identityEvents(DECLINED)).map((payload) => payload.outcome)).toEqual(['action_needed', 'action_needed']);
    expect((await getAdminVerificationsPage(db, taylor, 'identity', now)).identity.find((row) => row.person.id === DECLINED)).toBeUndefined();
  });

  it('lets staff allow another double check when the failure looks like a glitch', async () => {
    await helper(RETRY);
    await photosApproved(RETRY, at(2));
    expect((await startIdentity(db, providers, RETRY, at(2.01), { consent: true })).ok).toBe(true);
    const failedAt = minutes(at(2.01), 5);
    await handlePersonaWebhook(db, personaEvent('inquiry.failed', 'inq_pa_3', 'failed', failedAt), failedAt);
    expect((await loadOnboardingState(db, RETRY, failedAt)).identity.blocked).toBe('double_check_review');

    const now = at(2.1);
    expect(await verificationAction(db, providers, taylor, { userId: RETRY, action: 'allow_double_check_retry', note: 'Persona timed out on the selfie; let them try again.' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await sessionOf('inq_pa_3')).toMatchObject({ reviewOutcome: 'retry_allowed', reviewedByUserId: taylor.id });
    expect((await loadOnboardingState(db, RETRY, now)).identity).toMatchObject({ status: 'requires_input', canStart: true, captureApproved: true, attempts: 2 });
    expect((await captureOf(RETRY)).status).toBe('approved');

    // The new inquiry passes, and the helper is verified.
    expect(await startIdentity(db, providers, RETRY, now, { consent: true })).toMatchObject({ ok: true, redirectTo: 'https://withpersona.com/verify?code=pa4' });
    const approvedAt = minutes(now, 5);
    await handlePersonaWebhook(db, personaEvent('inquiry.approved', 'inq_pa_4', 'approved', approvedAt, approvedAt, [governmentId()]), approvedAt);
    expect((await loadOnboardingState(db, RETRY, approvedAt)).identity).toMatchObject({ verified: true, cleared: true, attempts: 3 });
  });

  it('is the only check for a client, turns an approval for someone under 18 into a failure, and refuses bad signatures', async () => {
    await db.insert(users).values({ id: CLIENT, email: `${CLIENT}@example.test`, name: 'Paula P.', firstName: 'Paula', lastName: 'Park', phone: '+15125550388', phoneVerifiedAt: at(-60), createdAt: at(-60) });
    // A client asked for an ID check (two recent reports): Persona's check is the only one, with no photos of ours.
    const report = (id: string) => ({ id, type: 'report_user', status: 'open', openedByUserId: 'usr_jordan', subjectUserId: CLIENT, reason: 'harassment', createdAt: at(2.5) });
    await db.insert(supportCases).values([report('cas_pa_1'), report('cas_pa_2')]);
    const started = await startPosterIdentity(db, providers, CLIENT, at(3), { consent: true });
    expect(started).toMatchObject({ ok: true, redirectTo: 'https://withpersona.com/verify?code=pa5' });
    expect(JSON.parse(String(fetch.mock.calls.at(-1)![1]?.body)).data.attributes['redirect-uri']).toBe(`https://tasksnearme.test${routes.app.verifyIdentity()}`);

    const made = minutes(at(3), 5);
    const minor = personaEvent('inquiry.approved', 'inq_pa_5', 'approved', made, made, [governmentId('2012-01-01')]);
    const altered = `${minor.signature.slice(0, -1)}${minor.signature.endsWith('0') ? '1' : '0'}`;
    expect(await handlePersonaWebhook(db, { ...minor, signature: altered }, made)).toEqual({ status: 400, body: { ok: false } });
    expect(await handlePersonaWebhook(db, { ...minor, secret: 'wbhsec_other' }, made)).toEqual({ status: 400, body: { ok: false } });
    // Signed more than 5 minutes before it arrived: a replay.
    expect(await handlePersonaWebhook(db, minor, minutes(made, 6))).toEqual({ status: 400, body: { ok: false } });
    expect(await sessionOf('inq_pa_5')).toMatchObject({ status: 'processing' });

    expect(await handlePersonaWebhook(db, minor, made)).toEqual({ status: 200, body: { ok: true } });
    expect(await sessionOf('inq_pa_5')).toMatchObject({ status: 'requires_input', failureReason: 'under_18', isAdult: false, providerOutcome: 'approved' });
    // A client's failed check isn't a case for staff: there are no photos of ours to compare.
    expect((await loadOnboardingState(db, CLIENT, made)).identity.blocked).toBe('under_18');
    expect((await identityEvents(CLIENT)).map((payload) => payload.track)).toEqual(['poster_identity']);

    // Unknown inquiries and other events are acknowledged and ignored.
    expect(await handlePersonaWebhook(db, personaEvent('inquiry.approved', 'inq_unknown', 'approved', made), made)).toEqual({ status: 200, body: { ok: true, ignored: true } });
    const account = JSON.stringify({ data: { type: 'event', attributes: { name: 'account.created', 'created-at': made.toISOString(), payload: { data: { type: 'account', id: 'act_1', attributes: {} } } } } });
    const t = Math.floor(made.getTime() / 1000);
    const signed = { payload: account, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${account}`).digest('hex')}`, secret: SECRET };
    expect(await handlePersonaWebhook(db, signed, made)).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });
});

describe('Persona through the webhook inbox', () => {
  beforeAll(() => {
    vi.stubEnv('PERSONA_API_KEY', 'persona_sandbox_key');
    vi.stubEnv('PERSONA_INQUIRY_TEMPLATE_ID', 'itmpl_test');
    vi.stubEnv('PERSONA_WEBHOOK_SECRET', SECRET);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  const rowOf = async (eventId: string) => (await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, 'persona'), eq(webhookEvents.eventId, eventId))))[0];

  it('records each event once by its id, and replays a stored one signed again with our secret', async () => {
    await helper(INBOX);
    await photosApproved(INBOX, at(4));
    expect(await startIdentity(db, providers, INBOX, at(4.01), { consent: true })).toMatchObject({ ok: true, redirectTo: 'https://withpersona.com/verify?code=pa6' });
    const made = minutes(at(4.01), 3);
    const completed = personaEvent('inquiry.completed', 'inq_pa_6', 'completed', made);
    const headers = { 'persona-signature': completed.signature };
    expect(await receiveWebhook(db, 'persona', completed.payload, headers, made)).toEqual({ status: 200, body: { ok: true } });
    expect(await rowOf(`evt_inquiry.completed_${made.getTime()}`)).toMatchObject({ status: 'processed', type: 'inquiry.completed', attempts: 1, payload: null });
    expect(await receiveWebhook(db, 'persona', completed.payload, headers, made)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    // A bad signature is refused and not recorded.
    const approvedAt = minutes(made, 2);
    const approved = personaEvent('inquiry.approved', 'inq_pa_6', 'approved', approvedAt, approvedAt, [governmentId()]);
    expect(await receiveWebhook(db, 'persona', approved.payload, { 'persona-signature': completed.signature }, approvedAt)).toEqual({ status: 400, body: { ok: false } });
    expect(await rowOf(`evt_inquiry.approved_${approvedAt.getTime()}`)).toBeUndefined();

    // The approval failed to process earlier (kept with its payload): a replay an hour later, signed again, applies it.
    await db.insert(webhookEvents).values({ id: 'whk_pa_failed', provider: 'persona', eventId: `evt_inquiry.approved_${approvedAt.getTime()}`, type: 'inquiry.approved', payloadHash: 'x', payload: approved.payload, status: 'failed', attempts: 1, lastError: 'Error: deadlock detected', receivedAt: approvedAt, nextAttemptAt: minutes(approvedAt, 5), updatedAt: approvedAt });
    const [failed] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, 'whk_pa_failed'));
    expect(await replayWebhook(db, failed!, minutes(approvedAt, 60))).toBe(true);
    expect(await rowOf(`evt_inquiry.approved_${approvedAt.getTime()}`)).toMatchObject({ status: 'processed', attempts: 2, payload: null });
    expect(await sessionOf('inq_pa_6')).toMatchObject({ status: 'verified', providerOutcome: 'approved' });
  });
});
