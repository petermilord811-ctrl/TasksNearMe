import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Checkr (blueprint 06 §1): background checks through Checkr's hosted invitation, where the person gives
 * their SSN, date of birth and FCRA consent to Checkr (never to us). Written against Checkr's REST API v1
 * (basic auth with the API key). With `CHECKR_API_KEY` and `CHECKR_PACKAGE` it replaces the stand-in at
 * /dev/providers/background; outcomes arrive at /api/webhooks/checkr, signed with the same key
 * (`X-Checkr-Signature`). Only the report's status comes back into the app, never its contents.
 */

const API = 'https://api.checkr.com/v1';
/** The pre-adverse notice gives the person this long before Checkr sends the final notice. */
const ADVERSE_WAIT_DAYS = 7;

export type CheckrStatus = 'pending' | 'clear' | 'consider' | 'suspended' | 'canceled';

export interface Checkr {
  readonly provider: 'checkr';
  /**
   * A candidate and an invitation; the candidate's id is the check's reference (webhooks carry it). Both carry where
   * the person works (`work_locations`), from which Checkr applies the state's and city's rules, so there's no default.
   */
  start(person: { userId: string; email: string; firstName: string; lastName: string; workLocation: { state: string; city: string | null } }): Promise<{ ref: string; url: string }>;
  /** The pre-adverse notice for the latest report, with every adverse item; Checkr sends the final notice 7 days later. Returns its id. */
  preAdverseAction(ref: string): Promise<string>;
  /** Checkr sends the final notice on its schedule: nothing to do. */
  postAdverseAction(ref: string): Promise<void>;
  /** Staff decided for the person after all: the scheduled final notice is canceled. */
  cancelAdverseAction(adverseActionId: string): Promise<void>;
  /** The candidate's invitations still waiting are canceled (an account being deleted, privacy rehearsal J-PR11). */
  cancelInvitations(ref: string): Promise<void>;
}

export function createCheckr(config: { apiKey: string; packageSlug: string; fetch?: typeof fetch; now?: () => Date }): Checkr {
  const doFetch = config.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${config.apiKey}:`).toString('base64')}`;
  async function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
    const response = await doFetch(`${API}${path}`, {
      method,
      headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Checkr answered ${response.status}`);
    return response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  }
  return {
    provider: 'checkr',
    async start(person) {
      const { state, city } = person.workLocation;
      const workLocations = [{ country: 'US', state, ...(city ? { city } : {}) }];
      const candidate = await call('POST', '/candidates', { email: person.email, first_name: person.firstName, last_name: person.lastName, custom_id: person.userId, work_locations: workLocations });
      if (typeof candidate.id !== 'string') throw new Error('Checkr made no candidate');
      const invitation = await call('POST', '/invitations', { candidate_id: candidate.id, package: config.packageSlug, work_locations: workLocations });
      if (typeof invitation.invitation_url !== 'string') throw new Error('Checkr sent no invitation URL');
      return { ref: candidate.id, url: invitation.invitation_url };
    },
    async preAdverseAction(ref) {
      const candidate = await call('GET', `/candidates/${encodeURIComponent(ref)}`);
      const reports = Array.isArray(candidate.report_ids) ? (candidate.report_ids as unknown[]).filter((id): id is string => typeof id === 'string') : [];
      const reportId = reports.at(-1);
      if (!reportId) throw new Error('Checkr has no report for this candidate');
      const items = await call('GET', `/reports/${encodeURIComponent(reportId)}/adverse_items`);
      const itemIds = Array.isArray(items.data) ? (items.data as { id?: unknown }[]).map((item) => item.id).filter((id): id is string => typeof id === 'string') : [];
      const now = config.now?.() ?? new Date();
      const action = await call('POST', `/reports/${encodeURIComponent(reportId)}/adverse_actions`, {
        adverse_item_ids: itemIds,
        post_notice_scheduled_at: new Date(now.getTime() + ADVERSE_WAIT_DAYS * 86_400_000).toISOString(),
      });
      if (typeof action.id !== 'string') throw new Error('Checkr made no adverse action');
      return action.id;
    },
    async postAdverseAction() {},
    async cancelAdverseAction(adverseActionId) {
      await call('DELETE', `/adverse_actions/${encodeURIComponent(adverseActionId)}`);
    },
    async cancelInvitations(ref) {
      const list = await call('GET', `/invitations?candidate_id=${encodeURIComponent(ref)}&status=pending`);
      const ids = Array.isArray(list.data) ? (list.data as { id?: unknown }[]).map((item) => item.id).filter((id): id is string => typeof id === 'string') : [];
      for (const id of ids) await call('DELETE', `/invitations/${encodeURIComponent(id)}`);
    },
  };
}

/** `X-Checkr-Signature`: the hex HMAC-SHA256 of the raw body, keyed with the API key. */
export function verifyCheckrSignature(input: { payload: string; header: string | null; apiKey: string }): boolean {
  if (!input.header || !/^[0-9a-f]+$/i.test(input.header)) return false;
  const expected = createHmac('sha256', input.apiKey).update(input.payload).digest();
  const given = Buffer.from(input.header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The events the app acts on: the invitation finished (the report is underway) or expired, and the
 * report's outcome. Checkr's own adjudication and dispute events are left to our staff flow.
 */
export function parseCheckrEvent(event: unknown): { ref: string; status: CheckrStatus } | null {
  if (!event || typeof event !== 'object') return null;
  const { type, data } = event as { type?: unknown; data?: { object?: { candidate_id?: unknown; status?: unknown; result?: unknown } } };
  const object = data?.object;
  const ref = typeof object?.candidate_id === 'string' ? object.candidate_id : null;
  if (typeof type !== 'string' || !ref) return null;
  switch (type) {
    case 'invitation.completed':
    case 'report.resumed':
      return { ref, status: 'pending' };
    case 'invitation.expired':
    case 'report.canceled':
      return { ref, status: 'canceled' };
    case 'report.suspended':
      return { ref, status: 'suspended' };
    case 'report.completed': {
      const outcome = typeof object?.result === 'string' ? object.result : typeof object?.status === 'string' ? object.status : '';
      return outcome === 'clear' || outcome === 'consider' ? { ref, status: outcome } : null;
    }
    default:
      return null;
  }
}

export function checkrFromEnv(env: Record<string, string | undefined> = process.env): Checkr | null {
  const apiKey = env.CHECKR_API_KEY?.trim();
  const packageSlug = env.CHECKR_PACKAGE?.trim();
  return apiKey && packageSlug ? createCheckr({ apiKey, packageSlug }) : null;
}
