import 'server-only';
import { eq } from 'drizzle-orm';
import { localeOrDefault } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import type { Db } from '@/platform/db/connect';
import { recordContactChange } from './contact-revert';
import { contactRevertUrl } from './contact-revert-token';
import { renderSignInAddedNotice, type AddedSignInMethod } from './emails/contact-change';
import { users } from './schema';

export type { AddedSignInMethod };

export interface SignInAddedDeps {
  db: Db;
  email: EmailProvider;
  appUrl: string;
}

/**
 * A new way to sign in on an account that finished sign-up: Google or Microsoft connected, or a passkey added
 * (security review SEC15). The account's email hears about it, with a "Not you?" link (contact-revert.ts) that signs
 * every device out and removes every way in but the emailed code. Someone holding a session could otherwise add their
 * own way back in and keep it through every later recovery. Sign-up's own first way in isn't announced: the account
 * has no finished profile yet. A notice never fails what it reports.
 */
export async function noticeSignInAdded(deps: SignInAddedDeps, input: { userId: string; method: AddedSignInMethod }, now: Date): Promise<boolean> {
  try {
    const [user] = await deps.db
      .select({ email: users.email, locale: users.locale, status: users.status, firstName: users.firstName, termsAcceptedAt: users.termsAcceptedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user || user.status === 'deleted' || !user.termsAcceptedAt || user.firstName.trim() === '') return false;
    const next = input.method.kind === 'passkey' ? `passkey:${input.method.name}` : input.method.kind;
    const link = await recordContactChange(deps.db, { userId: input.userId, kind: 'sign_in', previous: '', next }, now);
    const rendered = renderSignInAddedNotice({ method: input.method, revertUrl: contactRevertUrl(deps.appUrl, link, { locale: localeOrDefault(user.locale) }), appUrl: deps.appUrl, locale: localeOrDefault(user.locale) });
    await deps.email.send({ to: user.email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'sign-in-added' });
    return true;
  } catch (error) {
    console.error('[sign-in-added]', error);
    return false;
  }
}
