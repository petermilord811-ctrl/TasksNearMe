# UI-004 — Sign-in, phone verification, waitlist, help center, legal pages

**Status:** ready for Codex · **Branch:** `ui/UI-004-sign-in-waitlist-help-legal` · **Plan first:** no (unattended) · **Depends on:** UI-003 (merged)

## Goal
The first screens with forms. Build the one-page sign-in flow (email code, then name and age for new accounts, then phone verification when needed), the waitlist, the help center and help articles, and the legal document page. Also handle two follow-ups from UI-003. Claude wires the screens into `/sign-in`, `/waitlist`, `/help`, `/help/[article]`, and `/legal/[doc]` inside `PublicShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-004.md` (last step).

## Read first
- `AGENTS.md`
- `docs/ui/design-system.md`: §4.1 (use the current shadcn **field** pattern with react-hook-form), §6 (voice), and **§7 (forms: label, hint, and error tied with `aria-describedby`; focus the first invalid field; announce async results; countdowns are informative only)**. Inputs use 16 px text.
- Contracts:
  - `src/contracts/auth.ts`: `SignInPageData`, `SignInStep`, `PhoneReason`, `SignInHandlers`, and the schemas and input types.
  - `src/contracts/forms.ts`: field schemas. **Every zod message is a `FieldErrorCode`.**
  - `src/contracts/actions.ts`: `ActionResult` (new: `fieldErrors` holds `FieldErrorCode[]`, plus `retryAt`) and `FIELD_ERROR_CODES`.
  - `src/contracts/content.ts`: `ContentBlock`, `RichText`, `HelpCenterData`, `HelpArticleData`, `LegalDocData`.
  - `src/contracts/marketing.ts`: `WaitlistPageData`, `waitlistInputSchema`, `WaitlistHandlers`, and the UI-003 follow-up fields.
  - `src/contracts/routes.ts`.
- Fixtures: `src/fixtures/auth.ts` (every step, `signInResults`, `fakeSignInHandlers`), `content.ts`, `marketing.ts` (`waitlistPageData`, updated reward and cancellation data), and `actions.ts` (`fakeHandler`).
- `src/shared/phone.ts`, if you want to format a typed number as the person types (optional).

## Forms (applies to every form in this ticket and later ones)
- Use react-hook-form with `zodResolver(<contract schema>)`. Add `@hookform/resolvers` with `npm install`.
- Messages come from codes: `t(\`forms.fieldErrors.${code}\`)`. This covers both client errors (the zod `message` is the code) and server errors (`result.fieldErrors[field][0]`, applied with `setError`). Write the copy for every `FIELD_ERROR_CODES` entry in a new `forms` namespace. The copy may depend on the field (for example `forms.fieldErrors.required` plus field-specific overrides such as `forms.fields.code.incorrect`), but the code is the key.
- **Pending state:** disable the submit button and show a spinner while the handler promise is pending. Never double-submit.
- **Results:** a non-field error (`rate_limited`, `not_allowed`, `expired`, `unknown`) appears in an inline `Alert` above the submit button, announced politely. `rate_limited` with `retryAt` says when to try again (`formatTime` / `formatDateTime`, Central time).
- **Autocomplete:** email `email`; code `one-time-code` with `inputMode="numeric"`, a single input, max length 6; first and last name `given-name` / `family-name`; phone `tel` with `type="tel"`; ZIP `postal-code` with `inputMode="numeric"`.

## Build

**Screens** (`src/ui/screens/auth/`, `src/ui/screens/public/`, `src/ui/screens/content/`). Each has exactly one H1.

| Screen | Props | Content |
|---|---|---|
| `SignInScreen` | `data: SignInPageData`, `handlers: SignInHandlers` | A centered card (max 420 px) that renders **`data.step`**. Don't keep your own step state: after a successful call, the app refreshes `data`, or the result carries `redirectTo` (then `router.replace(redirectTo)`). Steps are listed below. Mention once, quietly, that sign-in and sign-up are the same. |
| `WaitlistScreen` | `data: WaitlistPageData`, `handlers: WaitlistHandlers` | "We're not in your city yet." Form: email, ZIP, and interest (radio group: I need help / I want to help / Both). On ok `submitted`, replace the form with a confirmation ("You're on the list. We'll email {email} when TasksNearMe opens near {zip}."). Below the form: "Already in Austin?" with a link to `routes.market(slug)` for each market in `data.markets` |
| `HelpCenterScreen` | `data: HelpCenterData` | Title and a search field that **filters the listed articles by title and summary on the client** (no fetching; an empty result says so and offers the support link). Topics as sections, each with its article links (`routes.help(slug)`) and summaries. A "Still need help?" card linking to `routes.app.support()` |
| `HelpArticleScreen` | `data: HelpArticleData` | Breadcrumb (Help center → topic title), H1 title, summary, "Updated Nov 2, 2026" (`formatDate`), `ContentBlocks`, related articles, and the support card |
| `LegalDocScreen` | `data: LegalDocData` | H1 title, version and dates ("Draft 0.1 · Updated Nov 2, 2026", or "Effective …" when published). **When `status === 'draft'`, show a warning banner: not in effect yet, being reviewed.** Then the summary, a table of contents (anchor links to `#section.id`), the sections (H2 + `ContentBlocks`), and an "Other policies" list (`routes.legal(doc)`) |

**SignInScreen steps** (one component per step, in the same folder):

| Step | Content | Handler(s) |
|---|---|---|
| `email` | "Sign in or create an account". Email field, then **Continue** | `onRequestEmailCode` |
| `email_code` | "Check your email". Explain that we sent a 6-digit code to **{data.email}** and that it works for {codeLifetimeMinutes} minutes. Code field, then **Continue**. "Send a new code": disabled with an informative countdown until `resendAvailableAt` (device clock), and it confirms "New code sent" when it succeeds. "Use a different email" | `onVerifyEmailCode`, `onResendEmailCode`, `onChangeEmail` |
| `profile` | "Tell us your name". First name and last name, with a hint: "Others see your first name and last initial." Checkboxes "I'm 18 or older" and "I agree to the Terms of service and Privacy policy" (links to `routes.legal('terms')` and `routes.legal('privacy')`). Prefill from `profileDefaults` | `onSaveProfile` |
| `phone` | "Add your phone number". Reason copy per `phoneReason` (`post`: "You need a verified phone to post a task"; `offer`; `book`; `account`). Add "We text a code. We never share your number." and "US numbers only". Phone field | `onSendPhoneCode` |
| `phone_code` | "Enter the code we texted to {maskedPhone}". Code field. Resend and "Use a different number" work as in `email_code` | `onVerifyPhoneCode`, `onResendPhoneCode`, `onChangePhone` |

So that previews can show error states without interaction, each step component takes an optional **`initialResult?: ActionResult`**. The screen keeps the last result in state; previews pass a fixture result.

**Components** (export from `src/ui/components/index.ts`):

| Component | File | Props | Notes |
|---|---|---|---|
| `ContentBlocks` | `components/content/content-blocks.tsx` | `blocks: ContentBlock[]`, `headingLevel?: 2 \| 3` (level for `heading` blocks, default 2) | Renders paragraphs, lists (ordered or bulleted), headings, and callouts (`info` / `warning`, as an `Alert`). An internal link (`href` starting with "/") uses `next/link`. An external link has `rel="noopener noreferrer"` and visually hidden text "(opens another site)" but no `target`. **Never `dangerouslySetInnerHTML`.** `strong` nodes render `<strong>` |
| `SupportCard` | `components/content/support-card.tsx` | none | "Still need help?" with a link to `routes.app.support()` |

**UI-003 follow-ups** (contract requests accepted; the fixtures are updated):
1. `BecomeHelperScreen`: take the reward timing from data. Welcome uses `redeemWithinDays`. Repeat uses `minTaskPriceCents`, `unlockDays`, and `redeemWithinDays` ("…your 3rd paid booking of $25.00 or more with the same client within 90 days. Rewards unlock 7 days after the task is paid; redeem within 90 days."). No hard-coded 7 or 90.
2. `PricingScreen`: the "full refund" cells use `lateCancellationExample.posterPaidCents`, not `fixedExample.posterTotalCents`.

Copy namespaces: `signIn`, `waitlist`, `help`, `legal`, and `forms` (`fieldErrors.<code>`, field labels and hints shared across forms).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-sign-in/email`, `/email-code`, `/profile`, `/profile-prefilled`, `/phone-post`, `/phone-offer`, `/phone-code` | `signInEmailStep`, `signInEmailCodeStep`, `signInProfileStep`, `signInProfileStepPrefilled`, `signInPhoneStep`, `signInPhoneStepOffer`, `signInPhoneCodeStep`, with `fakeSignInHandlers` | Every step |
| `sign-in-step/code-incorrect`, `/code-expired`, `/too-many-tries`, `/phone-not-supported`, `/phone-in-use`, `/profile-incomplete`, `/account-not-allowed` | The matching step with `initialResult` from `signInResults` | Error states |
| `screen-waitlist/default`, `waitlist/joined` | `waitlistPageData`; the confirmation state | Form, then confirmation |
| `screen-help/center`, `screen-help/article` | `helpCenterData`, `helpArticleWhenCharged` | Index and article with every block type |
| `screen-legal/terms-draft` | `legalTermsDraft` | Draft banner, table of contents |
| `content-blocks/all` | `helpArticleWhenCharged.blocks` | The renderer by itself |
| `screen-become-helper/with-rewards` | `becomeHelperPageData` (updated) | Follow-up 1 |

## Tests
- Email step: an empty submit shows the `required` copy and never calls the handler. `" Maya@Example.TEST "` calls `onRequestEmailCode` with `{ email: 'maya@example.test' }` (the resolver's output).
- Code step: a `codeIncorrect` result shows the incorrect-code copy on the field. `tooManyTries` shows "9:10 am" (Central). The submit button is disabled while the handler is pending.
- Resend: disabled until `resendAvailableAt` (use fake timers), then enabled.
- Profile: both checkboxes are required (`must_accept`), and the terms and privacy links point to `routes.legal(...)`.
- Phone: `+44 20 7946 0958` shows the `not_supported` copy without calling the handler.
- A successful result with `redirectTo` calls `router.replace` (mock `next/navigation`).
- Waitlist: success replaces the form with the confirmation that names the ZIP.
- `ContentBlocks`: internal links render as `next/link` to "/pricing"; external links get `rel="noopener noreferrer"`; no HTML injection (a `<b>` inside a text node renders as text).
- `LegalDocScreen`: the draft banner shows only for `status: 'draft'`.
- Help search: typing "refund" narrows the list to matching articles.
- A test fails if any `forms` code lacks copy (iterate `FIELD_ERROR_CODES`).
- Banned-word test for the new namespaces (design-system §6).

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint).
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-004.md`.

## Out of scope
Routes, data, sessions, and server actions (Claude). Admin two-step verification. Changing the phone number from account settings (UI-017). The public task board, task page, and helper profile (UI-005).

## Claude wiring notes (after review)
- `/sign-in` runs the Better Auth email-code flow. The step comes from the session plus a short-lived pending-sign-in cookie. Phone verification uses a fake SMS provider in dev (dev outbox). Users get `adult_attested_at` and `terms_accepted_at`.
- `/waitlist` stores entries (`waitlist_entries`). `/help` and `/legal` read Markdown content files parsed into `ContentBlock[]`. All of these pages are `noindex` except help and legal.
