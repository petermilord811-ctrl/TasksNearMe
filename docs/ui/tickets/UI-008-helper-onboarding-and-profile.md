# UI-008 — Helper onboarding and profile editor

**Status:** ready for Codex · **Branch:** `ui/UI-008-helper-onboarding-and-profile` · **Plan first:** no (unattended) · **Depends on:** UI-024 (merged)

## Goal
Two screens for helpers, which Claude wires inside `AppShell`:
- **Onboarding** (`/app/helper/onboarding/[step]`): profile → services → area → ID check → payout setup → background check (in-home categories only) → done. It's a step flow, so it uses `AppShell layout="flow"`.
- **Profile editor** (`/app/helper/profile`), with everything a helper can change later, including work samples.

Read blueprint 06 §1 for what each check means. Identity, payouts, and background checks are **hosted by the providers**: the UI starts them (the handler returns `redirectTo`) and shows their status. It never collects ID numbers, SSNs, or bank details.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-008.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/06-verification-trust-compliance.md` §1 (the three tracks, what we store, public badges)
- Contracts:
  - **`src/contracts/onboarding.ts`:** `HelperOnboardingPageData`, `OnboardingProgress`, the form schemas (`helperProfileInputSchema`, `createHelperServicesSchema(categories)`, `helperAreaInputSchema`, `helperToolsInputSchema`), `VerificationSummary`, `IDENTITY_FAILURE_REASONS`, `SERVICE_RADIUS_MILES`, `LANGUAGE_CODES`, `HelperProfileEditorData`, and both handler interfaces.
  - `status.ts`: `IdentityStatus`, `BackgroundCheckStatus`, `PayoutAccountStatus`.
  - `routes.ts`: `ONBOARDING_STEPS`, `routes.app.helperOnboarding(step)`, `routes.helperProfile(handle)`.
  - `profiles.ts` (`WorkSampleView`), `posting.ts` (`PhotoUploadResult`), `people.ts` (`VerificationBadges`).
- Fixtures: **`src/fixtures/onboarding.ts`**: every step and state, `samProfileEditorData`, `fakeOnboardingHandlers`, `fakeProfileEditorHandlers`.
- Existing components to reuse: `VerificationBadges`, `WorkSampleGallery`, `Money`, the forms pattern from UI-004 and UI-006 (fields, error codes, pending states).

## Build

**Screens** (`src/ui/screens/helper/`)

| Screen | Props | Content |
|---|---|---|
| `HelperOnboardingScreen` | `data: HelperOnboardingPageData`, `handlers: HelperOnboardingHandlers` | **Stepper:** from `progress.steps` (done, current, todo, skipped, locked). Done steps link to `routes.app.helperOnboarding(step)`; locked steps are not links. **One step per screen**, with the step from `data.step`. **Steps:** listed below. Saves follow `redirectTo` |
| `HelperProfileEditorScreen` | `data: HelperProfileEditorData`, `handlers: HelperProfileEditorHandlers` | Sections (tabs on desktop, an accordion or anchored list on phones): **Profile**, **Services**, **Area**, **Tools**, **Work samples**, **Verification** (status only: the same badges and statuses as onboarding, with links to finish anything missing), and **Visibility** (pause or resume with `onSetPaused`; explain that paused profiles don't appear in search or receive invites). Each section saves on its own and shows "Saved". A "View public profile" link (`routes.helperProfile(handle)`). **Work samples:** upload (same rules and errors as task photos), caption and category per sample, remove (confirm), reorder (move up/down buttons; no drag-only control), and the limit `maxWorkSamples` |

**Onboarding steps**

| Step | Content |
|---|---|
| `profile` | Headline (counter), bio (counter), languages (checkboxes from `languageOptions`). A note that clients see the first name and last initial |
| `services` | Add one or more services from `categories`: pricing type (fixed "from" price or hourly rate plus minimum hours), with the category minimums explained, and a short description. Mark in-home categories with "Needs a background check" |
| `area` | Home area (select from `areas`), service radius (`SERVICE_RADIUS_MILES`, "about 5 miles"), and "I also help remotely" (only when an offered category has `remoteAllowed`) |
| `identity` | What happens: an ID photo and a selfie, about 2 minutes, handled by our ID partner, and what clients see ("ID verified · Nov 2026"). States: `not_started` → **Start ID check**. `processing` → "We're checking", with **Check status** (`onRefreshStatus`). `requires_input` → a reason from `IDENTITY_FAILURE_REASONS` and **Try again**. `verified` → done |
| `payout` | Where earnings go, set up with our payment partner (Stripe). "Your first payout can take about {firstPayoutDays} days." States: `not_started` / `pending` / `requirements_due` ("Stripe needs a bit more information") → **Set up payouts** or **Continue setup**. `active` → done. `restricted` → contact support |
| `background` | Only when `verification.background.requiredFor` isn't empty. Explain which categories need it (`requiredFor`), that it's run by a screening partner, and that it takes a few days. While it runs, show which categories are already bookable (`progress.bookableCategories`). States: `not_started` → **Start background check**. `invited` / `pending` → waiting. `clear` → done. `consider` → "Under review" (**never any details**). `expired` → start again |
| `done` | Bookable: "You can make offers now", with a link to find work (`routes.app.findWork()`) and a reminder of the welcome reward when present (`welcomeReward`). Not bookable yet: what's left, with links to those steps |

Copy namespace: `helperOnboarding`, `helperProfileEditor`, `verification` (status labels and explanations shared by both).

## States to preview
| Preview id | Fixture(s) |
|---|---|
| `screen-helper-onboarding/profile`, `/services`, `/area` | `onboardingProfileStep`, `onboardingServicesStep`, `onboardingAreaStep` |
| `screen-helper-onboarding/identity`, `/identity-retry`, `/identity-processing` | `onboardingIdentityStep`, `onboardingIdentityRetry`, `onboardingIdentityProcessing` |
| `screen-helper-onboarding/payout`, `/payout-action-needed` | `onboardingPayoutStep`, `onboardingPayoutActionNeeded` |
| `screen-helper-onboarding/background`, `/background-pending` | `onboardingBackgroundNotStarted`, `onboardingBackgroundPending` |
| `screen-helper-onboarding/done` | `onboardingDone` |
| `screen-helper-profile-editor/default`, `/paused` | `samProfileEditorData`, and the same with `paused: true` |

## Tests
- Every step's form validates with its contract schema. Services: a furniture price under $25.00 shows the `out_of_range` copy, and adding the same category twice shows an error.
- Save calls the matching handler with the form values and follows `redirectTo`.
- Locked steps aren't links; done steps are.
- Identity `requires_input` shows the reason copy for each `IDENTITY_FAILURE_REASONS` entry (iterate the constant). Background `consider` shows "Under review" and nothing else.
- The provider buttons call `onStartIdentity`, `onStartPayout`, and `onStartBackgroundCheck`, then navigate to `redirectTo`.
- Profile editor: reorder calls `onReorderWorkSamples` with the new order; remove asks for confirmation; pause calls `onSetPaused({ paused: true })`.
- No input ever asks for an ID number, SSN, date of birth, or bank account (assert there are no such labels).
- Copy exists for every status in `IDENTITY_STATUSES`, `BACKGROUND_CHECK_STATUSES`, and `PAYOUT_ACCOUNT_STATUSES`. Banned words.

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). The UI never decides bookability; it shows `progress`.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-008.md`.

## Out of scope
Finding work and making offers (UI-009). Rewards (UI-016). Earnings and payouts history (UI-016). Profile photos (later).

## Claude wiring notes (after review)
- Verification module:
  - `identity_verifications`, `payout_accounts`, and `eligibility_checks` tables;
  - dev stand-ins for Stripe Identity, Connect, and Checkr (`/dev/providers/*` pages with pass, fail, and review buttons, simulating the webhooks);
  - the bookability computation (per category), and recomputing badges on `helper_profiles`.
- Onboarding routes per step, with server-side step gating. `setMode('helper')` sends people here until they're bookable.
