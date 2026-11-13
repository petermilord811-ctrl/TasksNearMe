import { eq } from 'drizzle-orm';
import type { EmailFeedbackEvent } from '@/integrations/email/resend-webhook';
import type { Db } from '@/platform/db/connect';
import { emailSuppressions } from './schema';

/**
 * Addresses notification email stops going to (blueprint 09 §3: "suppress or mark the address"): a permanent
 * bounce or a spam complaint. The first reason is kept; repeats change nothing. Sign-in codes still go out.
 */
export async function recordEmailFeedback(db: Db, event: EmailFeedbackEvent, provider: string, now: Date): Promise<number> {
  let added = 0;
  for (const email of new Set(event.to)) {
    const rows = await db
      .insert(emailSuppressions)
      .values({ email, reason: event.kind, detail: event.detail, provider, createdAt: now })
      .onConflictDoNothing({ target: emailSuppressions.email })
      .returning({ email: emailSuppressions.email });
    added += rows.length;
  }
  return added;
}

export async function isEmailSuppressed(db: Db, email: string): Promise<boolean> {
  const [row] = await db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(eq(emailSuppressions.email, email.trim().toLowerCase())).limit(1);
  return row !== undefined;
}

/** Support (or the person fixing their mailbox) lets email go to the address again. */
export async function liftEmailSuppression(db: Db, email: string): Promise<boolean> {
  const rows = await db.delete(emailSuppressions).where(eq(emailSuppressions.email, email.trim().toLowerCase())).returning({ email: emailSuppressions.email });
  return rows.length > 0;
}
