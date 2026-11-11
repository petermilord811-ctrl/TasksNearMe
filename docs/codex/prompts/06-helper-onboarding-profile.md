# Prompt 06 — Helper onboarding and profile editor

**Plan first:** yes · **Depends on:** 02 · **Branch:** `ui/06-helper-onboarding`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §2 (Priya, Jordan), §7 (`onboarding.*`), §12 (`background_checks`)
- `docs/codex/design-system.md` §4.2 (`VerificationBadges`, `DemoBadge`), §6
- `docs/blueprint/06-verification-trust-compliance.md` §1 (the three tracks, their order, what's stored, badge meaning), §3 (biometric consent)
- `docs/blueprint/05-rewards.md` §4 (welcome eligibility)
- `docs/blueprint/04-payments-and-fees.md` §5 (first-payout timing)

## Build `/app/helper/onboarding/[step]`

Steps: `profile` → `services` → `area` → `identity` → `payout` → `background` (only when an in-home category is chosen **and** `background_checks` is on) → `done`.

The header lists every step with its status. Each step has **Save and continue**, and the flow resumes at the right step for each `onboarding.*` scenario.

1. **profile:**
   - First name (pre-filled); last name, with the note "Only your first name and last initial are public".
   - Handle, with a mock availability check.
   - Headline (≤ 80) and bio (≤ 600).
   - Initials avatar (photo upload comes later).
2. **services:**
   - Categories, each with pricing type, rate or "from" price (minimums from ui-contract §11), and minimum hours.
   - A tools checklist.
   - In-home categories note "Requires a background check".
3. **area:** a center (Austin area picker), a radius slider (1–25 mi) with `AreaMapPlaceholder`, and a "Remote OK" toggle (computer help only).
4. **identity:**
   - Explain what we check (government ID and a live selfie) and what we keep (only the result and the date).
   - **Biometric notice and consent:** a required checkbox (blueprint 06 §3).
   - **Continue to secure ID check** (Stripe Identity placeholder, with `DemoBadge`) returns to `?result=verified|processing|requires_input|canceled`.
   - Each result screen gives the next step (`requires_input` → try again; `canceled` → start again).
5. **payout:**
   - Explain: setup happens on our payment partner's secure page; we never see your SSN or bank details; tax forms are handled there too.
   - **Set up payouts** placeholder outcomes: `active`, `requirements_due` (show "Resume setup"), `pending`.
   - Note that the first payout usually arrives about 7 days after the first payment.
6. **background:**
   - A standalone disclosure screen (placeholder legal text marked Draft) and an authorization checkbox.
   - **Send me the secure link** → `invited` ("Check your email; the link is valid for 7 days").
   - Then `pending`, `clear`, or `consider`.
   - `consider` explains that in-home categories aren't available, that a notice and a copy of the report will come from the screening partner, that the helper can dispute it, and links to support.
   - With `background_checks` off, this step is skipped and in-home categories are disabled with an explanation.
7. **done:**
   - "You're ready to send offers", with a preview of the earned badges.
   - For founding helpers, a welcome card: "You're founding helper #63 of 100. Complete your first paid task of $40 or more within 60 days to earn a $50 gift card. Rewards never depend on reviews or ratings."

**Also build:**
- A **`BookableGate`** banner component, for use on later screens. It names the missing step and links to it.
- The **mode switch** behavior: choosing "I can help" without a helper profile opens `/app/helper/onboarding/profile`.

## Build `/app/helper/profile` (editor)
- Every field from the onboarding steps.
- Links to the services, area, and availability editors.
- **Pause profile**: hidden from search; existing bookings continue.
- **View public profile.**

## Tests
- E2E: Priya through every step and every outcome scenario; the consent checkbox is required; the gate banner shows the right missing step; the mode switch redirects; axe on every step at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Real identity, payout, or background-check integrations. These stay placeholders.

## Review (for the human)
As Priya, go from `onboarding.start` to `onboarding.bookable`, then open `onboarding.id_requires_input` and `onboarding.background_consider`.
