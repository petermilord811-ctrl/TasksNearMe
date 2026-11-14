'use server';

import type { ActionResult, PublicSupportInput } from '@/contracts';
import { localeOrDefault } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { checkBot } from '@/modules/accounts/bot-check';
import { clientIp } from '@/modules/accounts/sign-in/server';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { submitPublicSupportRequest } from './public-requests';

/** `routes.helpContact()`'s form (PublicSupportHandlers.onSubmit), bound to the page's language. No sign-in needed. */
export async function submitPublicSupportAction(locale: string, input: PublicSupportInput): Promise<ActionResult> {
  return submitPublicSupportRequest(
    { db, email: createEmailProvider(db), appUrl: appUrl(), checkBot: (token) => checkBot('support', token), ip: await clientIp(), locale: localeOrDefault(locale), now: await requestNow() },
    input,
  );
}
