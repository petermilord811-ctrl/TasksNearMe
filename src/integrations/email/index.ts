import { newId } from '@/platform/db/ids';
import type { Db } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { createPostmarkEmailProvider } from './postmark';
import { createResendEmailProvider } from './resend';

/**
 * Email provider port. Development and tests use the dev outbox (rows shown at /dev/outbox, with the HTML
 * version in a frame). With a provider key, email goes out for real from EMAIL_FROM: Postmark
 * (POSTMARK_SERVER_TOKEN) or Resend (RESEND_API_KEY); docs/integration-points.md.
 *
 * Outside production a key never takes the outbox away: every email is still recorded there (the e2e tests
 * read codes from it, and seeded people have `example.test` addresses), and only real addresses also go out
 * through the provider. A send the provider refuses there is logged, not thrown. Reserved test domains never
 * reach a provider in any environment.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** The plain-text version: always sent, for clients that don't show HTML. */
  text: string;
  /** The designed version. */
  html?: string;
  /** What kind of email it is, e.g. `welcome` or `sign-in-code` (the provider's tag, for its stats). */
  tag?: string;
  /** Extra headers, e.g. `List-Unsubscribe` and `List-Unsubscribe-Post` on notification emails. */
  headers?: Record<string, string>;
  /** The same key on a retry means the provider sends it once (Resend). */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export function createDevOutboxEmailProvider(db: Db): EmailProvider {
  return {
    name: 'dev-outbox',
    async send(message) {
      await db.insert(devOutboxMessages).values({
        id: newId('msg'),
        channel: 'email',
        to: message.to.toLowerCase(),
        subject: message.subject,
        body: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.tag ? { tag: message.tag } : {}),
      });
    },
  };
}

/** Domains that can never receive mail (RFC 2606 and 6761): seeded people and tests use them. */
const RESERVED = /(^|\.)(test|example|invalid|localhost)$|(^|\.)example\.(com|net|org)$/i;
export function isReservedEmailAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split('@')[1] ?? '';
  return domain === '' || RESERVED.test(domain);
}

/** The real provider, but never for reserved addresses (they'd only bounce). */
function realOnly(real: EmailProvider): EmailProvider {
  return {
    name: real.name,
    async send(message) {
      if (isReservedEmailAddress(message.to)) return;
      await real.send(message);
    },
  };
}

/** Outside production: the outbox always, and the provider too for real addresses. */
function withOutbox(outbox: EmailProvider, real: EmailProvider): EmailProvider {
  return {
    name: `${real.name}+dev-outbox`,
    async send(message) {
      await outbox.send(message);
      if (isReservedEmailAddress(message.to)) return;
      try {
        await real.send(message);
      } catch (error) {
        // Before a domain is verified, providers only deliver to the account's own address: that's expected here.
        console.warn(`[email] ${real.name} didn't send "${message.tag ?? message.subject}" (a copy is in /dev/outbox):`, error instanceof Error ? error.message : error);
      }
    },
  };
}

export function createEmailProvider(db: Db, env: Record<string, string | undefined> = process.env): EmailProvider {
  const postmark = env.POSTMARK_SERVER_TOKEN?.trim();
  const resend = env.RESEND_API_KEY?.trim();
  if (postmark && resend) throw new Error('Both POSTMARK_SERVER_TOKEN and RESEND_API_KEY are set: keep the one email provider you use.');
  if (!postmark && !resend) return createDevOutboxEmailProvider(db);
  const from = env.EMAIL_FROM?.trim();
  if (!from) throw new Error(`${postmark ? 'POSTMARK_SERVER_TOKEN' : 'RESEND_API_KEY'} is set but EMAIL_FROM is empty: set a sender the provider has verified.`);
  const replyTo = env.EMAIL_REPLY_TO?.trim() || undefined;
  const real = postmark ? createPostmarkEmailProvider({ token: postmark, from, replyTo }) : createResendEmailProvider({ apiKey: resend!, from, replyTo });
  return env.NODE_ENV === 'production' ? realOnly(real) : withOutbox(createDevOutboxEmailProvider(db), real);
}
