import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ActionResult, AppLocale, CasePriority, PublicSupportInput, PublicSupportTopic } from '@/contracts';
import { publicSupportInputSchema } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { rateLimited, validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimits, type RateLimitRule } from '@/platform/rate-limit';
import { renderPublicSupportReceived } from './emails';
import { supportCaseEvents, supportCases } from './schema';

/**
 * Support for people who aren't signed in (completion plan 5.22): the contact form at `routes.helpContact()`
 * (src/contracts/public-support.ts). A request opens a case keyed by the address typed, with no member on it:
 * staff answer it by email (`staffEmailContact` in ./staff.ts) and never treat the address as proof of an
 * account. The answer and the confirmation email are the same whether or not an account uses the address,
 * and the confirmation never repeats the message, so the form can't be used to send someone else's words
 * from our address.
 */

export const PUBLIC_SUPPORT_RULES = {
  perEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
  perIp: { limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/** The blueprint's case types: account access is the requests queue's `account` type, shown apart by its topic. */
const CASE_TYPE: Record<PublicSupportTopic, string> = { account_access: 'account', payment: 'payment_issue', safety: 'safety', other: 'request' };
const PRIORITY: Record<PublicSupportTopic, CasePriority> = { account_access: 'high', payment: 'normal', safety: 'high', other: 'normal' };
const PRIORITY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
const UNFINISHED = ['open', 'awaiting_poster', 'awaiting_helper', 'awaiting_support', 'escalated'];

export interface PublicCaseInput {
  email: string;
  locale: AppLocale;
  topic: PublicSupportTopic;
  message: string;
  /** Where it came from, when not the contact form: an internal note tells staff. */
  source?: string;
}

/**
 * Opens a case for the address, or adds the message to its unfinished case on the same topic (someone writing
 * again before support answered). Returns the case id.
 */
export async function openPublicCase(db: Db, input: PublicCaseInput, now: Date): Promise<{ caseId: string; added: boolean }> {
  const email = input.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ id: supportCases.id, priority: supportCases.priority, status: supportCases.status })
      .from(supportCases)
      .where(and(eq(supportCases.contactEmail, email), eq(supportCases.topic, input.topic), inArray(supportCases.status, UNFINISHED)))
      .orderBy(desc(supportCases.createdAt))
      .limit(1)
      .for('update');
    if (open) {
      const priority = (PRIORITY_RANK[PRIORITY[input.topic]] ?? 1) > (PRIORITY_RANK[open.priority] ?? 1) ? PRIORITY[input.topic] : open.priority;
      await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: open.id, kind: 'message', body: input.message, meta: { fromContact: true }, createdAt: now });
      await tx
        .update(supportCases)
        .set({ priority, contactLocale: input.locale, updatedAt: now, ...(open.status === 'awaiting_poster' || open.status === 'awaiting_helper' ? { status: 'awaiting_support' } : {}) })
        .where(eq(supportCases.id, open.id));
      return { caseId: open.id, added: true };
    }
    const id = newId('case');
    const type = CASE_TYPE[input.topic];
    await tx.insert(supportCases).values({
      id,
      type,
      status: 'open',
      priority: PRIORITY[input.topic],
      openedByUserId: null,
      contactEmail: email,
      contactLocale: input.locale,
      topic: input.topic,
      description: input.message,
      createdAt: now,
      updatedAt: now,
    });
    if (input.source) {
      await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: id, kind: 'note', visibility: 'internal', body: input.source, createdAt: now });
    }
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type, contact: true } });
    return { caseId: id, added: false };
  });
}

export interface PublicSupportDeps {
  db: Db;
  email: EmailProvider;
  appUrl: string;
  /** Null when the bot check passed, else the result to return (`checkBot('support', token)`, accounts/bot-check.ts). */
  checkBot: (token: string | undefined) => Promise<ActionResult | null>;
  /** The sender's address, when known (not on this machine). */
  ip: string | null;
  /** The page's language: the confirmation and staff's answers use it. */
  locale: AppLocale;
  now: Date;
}

/** `PublicSupportHandlers.onSubmit`. */
export async function submitPublicSupportRequest(deps: PublicSupportDeps, input: PublicSupportInput): Promise<ActionResult> {
  const parsed = publicSupportInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const refused = await deps.checkBot(typeof input.botCheck === 'string' ? input.botCheck : undefined);
  if (refused) return refused;
  const { email, topic, message } = parsed.data;
  const limited = await consumeRateLimits(
    deps.db,
    [
      { key: `public-support:email:${email}`, rule: PUBLIC_SUPPORT_RULES.perEmail },
      ...(deps.ip ? [{ key: `public-support:ip:${deps.ip}`, rule: PUBLIC_SUPPORT_RULES.perIp }] : []),
    ],
    deps.now,
  );
  if (!limited.ok) return rateLimited(limited.retryAt);
  await openPublicCase(deps.db, { email, locale: deps.locale, topic, message }, deps.now);
  // The confirmation must never fail the request it confirms.
  try {
    const rendered = renderPublicSupportReceived({ appUrl: deps.appUrl, locale: deps.locale });
    await deps.email.send({ to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'support-received' });
  } catch (error) {
    console.error('[support-received]', error);
  }
  return { ok: true, code: 'submitted' };
}
