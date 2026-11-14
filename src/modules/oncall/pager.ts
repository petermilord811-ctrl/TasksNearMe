import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { EmailProvider } from '@/integrations/email';
import type { SmsSender } from '@/integrations/sms';
import { staffRoles, users } from '@/modules/accounts/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

/**
 * Paging the staff on call (completion plan 5.12; blueprint 06 §2: "an urgent support case and an on-call
 * page"). A page goes by text and email to the on-call contacts in the environment (`ONCALL_PHONES`,
 * `ONCALL_EMAILS`, comma-separated) and to every trust and safety staff member (their verified phone and their
 * email), at any hour: quiet hours don't apply. A page says what happened and links to the staff page; it never
 * carries names, addresses or messages. Each page is audited with how many were reached.
 *
 * Caps (completion plan 5.18): a case pages once for each kind of page, so a retried event or a second report on
 * the same case doesn't page again; and one reporter pages at most `REPORTER_PAGES_PER_DAY` times a day. Past that
 * their reports still open urgent cases in the queue, without a page (audited as `oncall.page_capped`).
 */

/** Pages one member's reports can send in 24 hours. */
export const REPORTER_PAGES_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60_000;

export interface Page {
  /** Short: "Urgent safety report". */
  subject: string;
  /** One or two sentences, no personal details. */
  text: string;
  /** The staff page to open, as a path ("/admin/cases/case_1"). */
  path: string;
  /** The member whose report this is: counted for their daily cap, kept in the audit row only, never sent. */
  reportedBy?: string;
}

export interface PagerDeps {
  db: Db;
  sms: SmsSender;
  email: EmailProvider;
  env?: Record<string, string | undefined>;
}

const list = (value: string | undefined) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

/** Who gets paged: the configured contacts and the trust and safety staff, each address once. */
export async function onCallContacts(db: Db, env: Record<string, string | undefined> = process.env): Promise<{ phones: string[]; emails: string[] }> {
  const staff = await db
    .select({ email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    // A suspended or banned staff member gets no pages.
    .where(and(inArray(staffRoles.role, ['trust_safety']), isNotNull(users.email), eq(users.status, 'active')));
  const phones = new Set(list(env.ONCALL_PHONES));
  const emails = new Set(list(env.ONCALL_EMAILS));
  for (const person of staff) {
    if (person.phone && person.phoneVerifiedAt) phones.add(person.phone);
    if (person.email) emails.add(person.email);
  }
  return { phones: [...phones], emails: [...emails] };
}

/** Why a page isn't sent: this case already paged for it, or the reporter reached their daily cap. */
async function capped(db: Db, page: Page, now: Date): Promise<'already_paged' | 'reporter_cap' | null> {
  const [seen] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'oncall.paged'), eq(auditLog.targetId, page.path), sql`${auditLog.metadata}->>'subject' = ${page.subject}`))
    .limit(1);
  if (seen) return 'already_paged';
  if (!page.reportedBy) return null;
  const recent = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'oncall.paged'), gt(auditLog.at, new Date(now.getTime() - DAY_MS).toISOString()), sql`${auditLog.metadata}->>'reportedBy' = ${page.reportedBy}`))
    .limit(REPORTER_PAGES_PER_DAY);
  return recent.length >= REPORTER_PAGES_PER_DAY ? 'reporter_cap' : null;
}

/** Sends one page to everyone on call, within the caps. One failed address never stops the others. */
export async function pageOnCall(deps: PagerDeps, page: Page, now: Date): Promise<{ sent: number; failed: number; skipped?: 'already_paged' | 'reporter_cap' }> {
  const skipped = await capped(deps.db, page, now);
  if (skipped) {
    if (skipped === 'reporter_cap') {
      await deps.db.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: null, actorRole: 'system', action: 'oncall.page_capped', targetType: 'page', targetId: page.path, metadata: { subject: page.subject, reportedBy: page.reportedBy, perDay: REPORTER_PAGES_PER_DAY } });
    }
    return { sent: 0, failed: 0, skipped };
  }
  const env = deps.env ?? process.env;
  const link = `${(env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${page.path}`;
  const { phones, emails } = await onCallContacts(deps.db, env);
  let sent = 0;
  let failed = 0;
  const attempt = async (send: () => Promise<void>) => {
    try {
      await send();
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error('[oncall] page failed', error);
    }
  };
  for (const to of phones) await attempt(() => deps.sms.send({ to, text: `TasksNearMe: ${page.subject}. ${page.text} ${link}` }));
  for (const to of emails) await attempt(() => deps.email.send({ to, subject: `[On call] ${page.subject}`, text: `${page.text}\n\nOpen it: ${link}`, tag: 'oncall-page' }));
  await deps.db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: null,
    actorRole: 'system',
    action: 'oncall.paged',
    targetType: 'page',
    targetId: page.path,
    metadata: { subject: page.subject, sent, failed, phones: phones.length, emails: emails.length, ...(page.reportedBy ? { reportedBy: page.reportedBy } : {}) },
  });
  return { sent, failed };
}
