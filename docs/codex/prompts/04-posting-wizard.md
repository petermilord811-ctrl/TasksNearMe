# Prompt 04 — Posting wizard

**Plan first:** yes · **Depends on:** 02 · **Branch:** `ui/04-post-task`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §3, §4 (`TaskOwnerView`, `PricingInput`), §10, §11, §12 (`ai_drafting`)
- `docs/codex/design-system.md` §4.2 (`StepWizard`, `PhotoPicker`, `PriceBreakdown`), §6
- `docs/blueprint/02-sitemap-and-journeys.md` J1
- `docs/blueprint/07-architecture.md` §8 (AI drafting never posts automatically and never sets a price)

## Build `/app/tasks/new` (8 steps in `StepWizard`)
1. **Category:** 5 tiles, each with one line of scope, plus a link to the prohibited-tasks page.
2. **Describe:** title (≤ 80 characters) and description (≤ 2,000).
   - Live blocked-keyword check (ui-contract §11) with a clear explanation and a link.
   - **Help me describe this** (flag `ai_drafting`):
     - Sends the one-liner to a mock. After about 1.5 s it returns a structured draft: title, scope bullets, filled category fields, 2–3 questions for the poster, and a duration estimate.
     - Show it as a suggestion card with **Accept all / Edit / Discard**. The poster's own text is never replaced without Accept.
     - Mock failure and refusal states fall back to the manual form with a friendly note.
     - Mark it with `DemoBadge` and `// TODO(integration): Anthropic`.
3. **Details:** the category fields from ui-contract §11, with a zod schema per category.
4. **Photos:** `PhotoPicker` (up to 8, local previews only). Show the hint about house numbers, mail, and faces, plus the note "We remove location data from photos."
5. **Where:** local or remote (remote only if the category allows it).
   - Local: address autocomplete placeholder (fixture suggestions on Example Lane), then unit and private access notes.
   - A preview card says "Helpers will see: Mueller, Austin — within about 1 mile", with `AreaMapPlaceholder` and the privacy sentence from design-system §6.
   - Remote: "No address needed."
6. **When:** a date picker plus a time window, or "Flexible — any time on this date". Validation: start at least 3 h from now and at most 14 days ahead, using `getNow()`.
7. **Budget:**
   - Fixed: a price input with the guidance range ("Typical in Austin: $50–$80") and the category minimum.
   - Hourly: rate, estimated hours, and cap. Moving help defaults to hourly with a 2 h minimum.
   - Optional expense allowance (amount and what it's for).
   - Live breakdown from `fees.ts`, for example "If booked at this price you'll pay $66.00 (task $60.00 + service fee $6.00)", plus an allowance line when set.
8. **Review:** two columns (stacked sections on phones), **Public** and **Only your booked helper sees**, each with edit links back to its step.
   - If the viewer's phone isn't verified, verify inline (mock code `123456`) before posting. Add a dev-toolbar toggle "phone not verified" to test this.
   - **Post** runs the mock action and switches the scenario to `desk.open.no_offers`.
   - It then redirects to `/app/tasks/[id]` with the toast "Your task is live. Nearby helpers have been notified."

**Behavior**
- The draft persists in `sessionStorage` per step, and Back keeps values.
- Leaving the wizard asks for confirmation.
- Next validates the step and moves focus to the first error.
- The Back/Next bar is sticky on phones.

## Tests
- Unit: per-category zod schemas; timing rules (3 h and 14 days against a fake now); blocked keywords.
- E2E at both viewports:
  - The desk flow (fixed, local).
  - Moving help (hourly with a cap).
  - Remote computer help.
  - Accepting and discarding an AI draft.
  - A blocked keyword showing its error.
  - axe on every step.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
The task management page after posting (prompt 05). The redirect target can stay a stub.

## Review (for the human)
At phone width, run the wizard once from scenario `desk.draft` and once from a fresh start. Try an invalid time and the blocked word "piano".
