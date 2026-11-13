import { SmsRejectedError } from './errors';
import type { SmsSender } from './index';

/**
 * Twilio Programmable Messaging (docs/integration-points.md), written against its REST API without the SDK:
 * one POST per text, from a Messaging Service (preferred: it handles the sender pool and A2P 10DLC) or a
 * number. The app makes and checks its own phone codes (hashed, 10 minutes, 5 tries), so Twilio only
 * delivers them. A number Twilio can't text, or one that replied STOP, comes back as `SmsRejectedError`.
 */

const API = 'https://api.twilio.com/2010-04-01';

/** Twilio error codes for numbers that can't get texts (invalid, landline, unroutable, region off) and STOP replies. */
const INVALID_NUMBER = new Set([21211, 21612, 21614, 21408]);
const OPTED_OUT = 21610;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** `MG…`: send through a Messaging Service. */
  messagingServiceSid?: string;
  /** E.164 sender, when there is no Messaging Service. */
  from?: string;
  fetch?: typeof fetch;
}

export function createTwilioSmsSender(config: TwilioConfig): SmsSender {
  const doFetch = config.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
  return {
    name: 'twilio',
    async send({ to, text }) {
      const body = new URLSearchParams({ To: to, Body: text });
      if (config.messagingServiceSid) body.set('MessagingServiceSid', config.messagingServiceSid);
      else if (config.from) body.set('From', config.from);
      const response = await doFetch(`${API}/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return;
      const error = (await response.json().catch(() => ({}))) as { code?: unknown };
      const code = typeof error.code === 'number' ? error.code : undefined;
      if (code !== undefined && INVALID_NUMBER.has(code)) throw new SmsRejectedError('invalid_number', code);
      if (code === OPTED_OUT) throw new SmsRejectedError('opted_out', code);
      throw new Error(`Twilio answered ${response.status}${code !== undefined ? ` (error ${code})` : ''}`);
    },
  };
}

/** Twilio when its keys are set: the account, its auth token, and a Messaging Service or a sender number. */
export function twilioFromEnv(env: Record<string, string | undefined> = process.env): SmsSender | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) return null;
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
  const from = env.TWILIO_FROM?.trim() || undefined;
  if (!authToken) throw new Error('TWILIO_ACCOUNT_SID is set but TWILIO_AUTH_TOKEN is empty.');
  if (!messagingServiceSid && !from) throw new Error('TWILIO_ACCOUNT_SID is set: also set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM.');
  return createTwilioSmsSender({ accountSid, authToken, ...(messagingServiceSid ? { messagingServiceSid } : {}), ...(from ? { from } : {}) });
}
