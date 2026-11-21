# Email or texts are down or slow

Postmark or Resend (email, one of them per server: `POSTMARK_SERVER_TOKEN` or `RESEND_API_KEY`) or Twilio (texts) refuses sends, answers with errors, or doesn't answer. Severity: **SEV2**. **SEV1** if sign-in codes fail for everyone and there's no other way in.

## How you find out

- **A page: "Emails aren't going out"** (or "Texts aren't going out"). Sends on that channel all failed for 3 job runs in a row, at least 3 of them, and none went through. At most one page an hour per channel. The page goes by both text and email, so an email outage reaches you by text, and the other way round.
  - **That needs a phone to page.** Set `ONCALL_PHONES` on the live site, or give trust and safety staff a verified phone. In the rehearsal nobody on call had one: the page fired on the third failing run and reached no one, so it was kept and retried every 5 minutes until email came back.
- `/admin/users/<id>`, "Emails and texts": each delivery with its status and the provider's reason. Addresses are masked in the reason.
- The server log: `[email]`, `[sms]` and `[outbox]` lines with the provider's error.
- The provider's own status page and dashboard.

## What people get meanwhile

| Flow | What happens |
|---|---|
| Asking for a sign-in code by email | "We couldn't send your code just now. Nothing's wrong on your side: try again in a few minutes." The form stays on the email step. Before 2026-11-21 it said "We sent a 6-digit code" and nothing came. Each try counts toward the limit of 3 codes per address in 10 minutes, so someone who tried 3 times waits up to 10 minutes after the provider is back. |
| Changing the account's email | "We couldn't reach a service we rely on just now, so nothing was done. Try again in a few minutes." |
| Phone codes by text | The form's error; they can sign in by email instead. |
| Notifications (email, text) | Each failed send is retried after 5, 30 and 120 minutes, then left failed. The bell and the app's pages still show everything. |
| On-call pages | Sent by both channels. A page that reached nobody is sent again every 5 minutes, up to 5 tries in a day. |
| A slow provider | Each call gives up after 15 s (email and texts) and counts as a failure. One 429 from an email provider is retried once after its `retry-after` (2 s at most). |

## What to do

1. Confirm it on the provider's status page. If it's an outage there, wait it out: notifications retry by themselves, and people can ask for a code again.
2. If it's ours, look at the server log's error:
   - an expired or revoked key;
   - a sender that's no longer verified (`EMAIL_FROM`);
   - a suspended account;
   - a Twilio Messaging Service that's no longer registered.

   Fix the setting in `preview.env` and `sudo systemctl restart tasksnearme-preview`.
3. Switching email providers takes a verified domain at the other provider, ready beforehand: set its key, remove the other, restart. Decisions, 2026-11-21: keep the second provider ready.
4. When it's back, sends go out on their next retry. Notifications that used up their 3 retries stay failed: support can tell people whatever mattered (a booking change, a cancellation) from `/admin/users/<id>`.

## Production without a provider

Without an email key, a production server refuses each email send, as it does texts without Twilio, so the failure shows up instead of disappearing. Before 2026-11-21, emails went into the development outbox, which a production build shows no one.

## Rehearsed

2026-11-21 on the e2e build, with the stand-in providers failing on purpose (`/dev/faults`, development and the e2e build only; sweep, "When things break"):
- a sign-in code with email down said it couldn't be sent within about a second;
- with email slow, it said so after the 15 s timeout, the button busy meanwhile;
- the outage page fired on the third failing run.
