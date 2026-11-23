import { eq } from 'drizzle-orm';
import { localeOrDefault, MARKET_TIME_ZONE, SUPPORT_TRANSCRIPTS_PER_DAY, type ActionResult } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { renderSupportTranscript } from './emails';
import { getSupportCasePage } from './service';

/**
 * "Email me this conversation" (2026-11-23, owner: "Live support: … get a transcript by email"): a case's conversation
 * exactly as the member sees it (their own messages with support, the assistant's chat before it, status changes and
 * the live chat's lines; never staff notes or another party's conversation), sent to their account's address in their
 * language, with times in their home market's zone. At most `SUPPORT_TRANSCRIPTS_PER_DAY` copies of a case a day for
 * each person. A send the provider refuses records nothing but the attempt (try again later: `unavailable`).
 */

export interface TranscriptMailer {
  email: EmailProvider;
  appUrl: string;
}

const TRANSCRIPT_RULE = { limit: SUPPORT_TRANSCRIPTS_PER_DAY, windowSeconds: 24 * 60 * 60 };

export async function emailSupportTranscript(db: Db, mailer: TranscriptMailer, userId: string, caseId: string, now: Date): Promise<ActionResult> {
  const page = await getSupportCasePage(db, userId, String(caseId), now, { markRead: false });
  if (!page) return { ok: false, code: 'not_allowed' };
  const [person] = await db
    .select({ email: users.email, firstName: users.firstName, locale: users.locale, timeZone: markets.timeZone })
    .from(users)
    .leftJoin(markets, eq(markets.id, users.homeMarketId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!person?.email) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `support-transcript:${page.case.id}:${userId}`, TRANSCRIPT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const rendered = renderSupportTranscript({
    page,
    firstName: person.firstName,
    appUrl: mailer.appUrl,
    locale: localeOrDefault(person.locale),
    timeZone: person.timeZone ?? MARKET_TIME_ZONE,
    now,
  });
  try {
    await mailer.email.send({ to: person.email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'support-transcript' });
  } catch (error) {
    console.error('[support-transcript]', error);
    return { ok: false, code: 'unavailable' };
  }
  return { ok: true, code: 'sent' };
}
