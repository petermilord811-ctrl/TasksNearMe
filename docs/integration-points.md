# Integration points: from stand-ins to real providers

Every outside service sits behind a small interface in `src/integrations/*` (or, for verification, in `src/modules/verification`). Development and tests use stand-ins with the same interface, so the app, its tests and the e2e flows run with no accounts or keys. This page lists each one, what the real adapter must do, and what to check when you switch.

**The safety rule in the code:** when a provider's key is set but its adapter isn't written yet, the factory throws instead of quietly faking. In production builds, the payment, gift card and AI stand-ins return `null` (the feature is unavailable) instead of pretending.

| Service | Interface | Stand-in today | Real provider (blueprint 07) | Switched on by |
|---|---|---|---|---|
| Card payments | `PaymentProvider` (`src/integrations/payments`) | `createDevPaymentProvider`: test cards (success, declined, insufficient funds, bank check) | Stripe PaymentIntents (charges; manual capture for invites) | `STRIPE_SECRET_KEY` |
| Helper transfers and payouts | `transfer()` in `src/modules/earnings/service.ts`; payout accounts in `src/modules/verification` | Transfers succeed at once (`devtr_…`); `/dev/providers/payout` | Stripe Connect Express: a Transfer per earning with `source_transaction` set to the charge | `STRIPE_SECRET_KEY` |
| ID checks | `src/modules/verification` (provider `dev`) | `/dev/providers/identity` picks the outcome | Stripe Identity (document and selfie; only "is adult" is stored) | Stripe keys |
| Background checks | `src/modules/verification` (provider `dev`) | `/dev/providers/background` | Checkr | Checkr key (to add) |
| Sign-in with Google or Microsoft | Better Auth social providers (`src/platform/auth/config.ts`, `src/integrations/oauth`) | The account chooser at `/dev/oauth/<provider>` (Better Auth's real flow; only the provider's page is replaced) | Google OAuth client; Microsoft Entra app registration | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` |
| Email | `EmailProvider` (`src/integrations/email`) | The dev outbox (`/dev/outbox`, with each designed email in a frame) | Postmark or Resend (**both built**: `src/integrations/email/postmark.ts`, `resend.ts`) | `POSTMARK_SERVER_TOKEN` or `RESEND_API_KEY` (one, never both), and `EMAIL_FROM` |
| Text messages and phone codes | `SmsSender` (`src/integrations/sms`) | The dev outbox | Twilio Verify (codes) and Programmable Messaging (alerts; needs A2P 10DLC or toll-free registration) | `TWILIO_ACCOUNT_SID` (and token, sender) |
| Gift cards (rewards) | `GiftCardProvider` (`src/integrations/gift-cards`) | `/dev/gift-cards/<id>` | Tremendous (sandbox first) | `TREMENDOUS_API_KEY` |
| Address search | `Geocoder` (`src/integrations/geocoding`) | Fixed sample places in Austin (`FAKE_PLACES`) | Google Places or Mapbox | `GOOGLE_MAPS_API_KEY` or `MAPBOX_TOKEN` |
| Photo storage | `FileStorage` (`src/integrations/storage`) | Local disk (`.data/uploads`) | Cloudflare R2 with presigned uploads | `R2_BUCKET` (and keys) |
| "Help me describe this" | `TaskDrafter` (`src/integrations/ai/task-drafter.ts`) | A canned drafter | Claude through `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| Map tiles | `MAP_STYLE_URL` | OpenFreeMap (free, no key) | Any MapLibre style (the same, or a paid one) | `MAP_STYLE_URL`, `MAP_ATTRIBUTION` |
| Web push | Not built yet (decisions.md) | — | Service worker, VAPID keys, `push_subscriptions` | — |

## What each adapter must do

### Payments (Stripe)
- `charge`: create and confirm a PaymentIntent with the saved or new card. Pass `idempotencyKey` through as Stripe's idempotency key: the app makes one per attempt and never starts a second attempt while one is in flight (T-05).
- `authorize` / `capture` / `cancelAuthorization`: manual-capture PaymentIntents for direct invites (authorized when sent, captured when the helper accepts).
- `completeAction`: after 3-D Secure. In production this is driven by the client-side Stripe.js flow and the `payment_intent.succeeded` / `payment_intent.payment_failed` webhooks; both paths must call the same idempotent confirmation (blueprint 07 §5).
- `refund`: partial and full refunds with the given key (cancellations, unused hours or allowance, change decreases, dispute settlements, goodwill).
- **Webhooks to add:** a route handler that verifies the signature, stores the event once, and runs the same settle functions the dev flow calls (`settle` in `src/modules/bookings/confirm.ts`, `settleDifference` in `changes.ts`). Out-of-order and duplicate events must be harmless.

### Transfers and payouts (Stripe Connect)
- Replace the body of `transfer()` in `src/modules/earnings/service.ts` with a Stripe Transfer to the helper's connected account (`source_transaction` = the booking's charge), keeping the `earnings` row as the ledger. Earnings, reimbursements and cancellation compensation are separate transfers.
- Payout accounts: Connect Express onboarding links replace `/dev/providers/payout`; the account webhook updates `payout_accounts.status`.

### ID checks (Stripe Identity) and background checks (Checkr)
- The verification module already models sessions, statuses and failure reasons; the adapters create the session or invitation and map the provider's webhook to the same outcomes the dev pages offer.
- Store only what the app uses: "verified", "is adult", and the check's status. Never the date of birth or the document.

### Sign-in with Google or Microsoft
There's no adapter to write: Better Auth has both providers built in. With keys set, the real provider replaces the stand-in for that provider; production builds without keys don't show its button.
- **Google** (Google Cloud console → APIs & Services → Credentials): an OAuth client of type *Web application*. Authorized redirect URI: `<APP_URL>/api/auth/callback/google` (one per environment). The consent screen asks only for `openid`, `email` and `profile`. Publish the consent screen before launch, or only test users can sign in.
- **Microsoft** (Microsoft Entra admin center → App registrations): supported account types *Accounts in any organizational directory and personal Microsoft accounts* (tenant `common`, the default) or *Personal Microsoft accounts only* (`MICROSOFT_TENANT_ID=consumers`). Platform *Web*, redirect URI `<APP_URL>/api/auth/callback/microsoft`, and a client secret (note its expiry date). To let work and school accounts sign up, add the optional ID-token claim `xms_edov` (email domain owner verified) under Token configuration. Without it, only personal accounts (Outlook.com, Hotmail, Live) and work accounts that say `email_verified` can create or join an account.
- **The rules, whichever provider:** an email creates or joins an account only when the provider confirms it (Google's `email_verified`; a Microsoft personal account, or `xms_edov`). Otherwise an organization's admin could claim anyone's address ("nOAuth"). Suspended, banned and closed accounts can't sign in this way. The account keeps "First L." and never takes the provider's photo (people add their own on the account page). Provider tokens are encrypted at rest, and no refresh tokens or Graph access are requested. Connecting and disconnecting go in the audit log.
- **To check when you switch:** sign in as a new person (the profile step shows their name), as an existing person with the same email (it joins their account), cancel on the provider's page (the sign-in page says so), then connect and disconnect the other provider from the account page.
- **"Error 400: redirect_uri_mismatch"** on Google's page means the OAuth client doesn't list the exact callback: add `<APP_URL>/api/auth/callback/google` (in development `http://localhost:3000/api/auth/callback/google`) under Authorized redirect URIs; Google can take a few minutes to apply it. While the consent screen is in Testing, only the test users listed there can sign in.
- **Tests never use the real providers:** outside production the stand-in also sits beside a provider that has keys, and answers the sign-ins of a browser with the `tnm_oauth_stand_in=1` cookie (the e2e tests set it).

### Email (Postmark or Resend) and texts (Twilio)
- **Postmark is built.** With `POSTMARK_SERVER_TOKEN` and `EMAIL_FROM` set, every email goes out through Postmark's transactional stream with its plain-text and designed versions and a tag (`sign-in-code`, `email-change-code`, `email-changed`, `phone-changed`, `welcome`, …). `EMAIL_FROM` must be a sender signature or a domain verified in Postmark (DKIM and Return-Path records). Until Postmark approves the account, it only delivers to addresses on your own verified domain.
- **Resend is built too**, the quickest way to see the emails in a real inbox. With `RESEND_API_KEY` and `EMAIL_FROM=onboarding@resend.dev`, Resend delivers only to the address that owns the Resend account; verify a domain in Resend (its DNS records) and set `EMAIL_FROM` on it to send to anyone. The tag goes along as a `kind` tag. Setting both keys is refused at startup.
- The designed emails share one layout (`src/platform/email/layout.ts`): tables and inline styles, light and dark, hover where supported. The sign-in code, the email-change code and the change notices, and the welcome email use it (`src/modules/accounts/emails/`); notification emails are plain text for now.
- `send` is all the app needs. Notification emails and texts go through `deliverNotifications` (`src/modules/notifications/delivery.ts`), which records every attempt in `notification_deliveries` and retries failures 5, 30 and 120 minutes later. Throw on a failed send so it's retried.
- Texts go only to verified phones; texts that can wait are held from 9 pm to 8 am market time.
- Before texting real people: register the sender (A2P 10DLC or toll-free) and add STOP handling.

### Gift cards (Tremendous)
- `order` places one reward order; the grant id travels as `externalId` (Tremendous's external id), so a retry never issues twice. The result's link replaces `/dev/gift-cards/<id>`.

### Address search (Google Places or Mapbox)
- `search` returns up to 5 places for typed text, `resolve` the full address for a place id. Only the public point (fuzzed 300–800 m) and the area are ever shown to anyone but the client and the booked helper.

### Photo storage (R2)
- `put` and `get` by key. Uploads already strip metadata (EXIF, GPS) and re-encode before storing; with R2, switch to presigned direct uploads so photos don't pass through Server Actions (decisions.md).
- Profile photos (`kind: avatar`) are cropped to a 512 px square around the face or subject. One is public only while it's its owner's current photo (`isCurrentProfilePhoto`); a replaced or removed photo goes back to owner and staff only. With a CDN in front of R2, keep avatars out of long shared caches, or a removed photo stays visible until the cache expires.

### "Help me describe this" (Claude)
- `draft` turns a short description into a task draft (title, description, details) for the category. Use the Anthropic SDK with a current model (a small one, such as Claude Haiku 5.5, is enough for drafting), a strict output schema, and the same moderation the form applies.

## Switching a provider on

1. Add the test-mode keys to `.env.local` (never commit them).
2. Write the adapter behind the existing interface and remove the factory's `throw`.
3. Run `node scripts/gate.mjs`: the unit and integration tests keep using the stand-ins, so they stay deterministic. Add an adapter test against the provider's test mode.
4. Walk the flow by hand in test mode: booking with a 3-D Secure card, a refund, a payout, an ID check, a gift card.
5. Check the launch scenarios that needed the real provider (blueprint 10 §3.2: T-03 with real cards, webhooks out of order, provider timeouts).
