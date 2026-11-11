# Prompt 07 — Helper: find work, offers, invites, availability

**Plan first:** yes · **Depends on:** 06 · **Branch:** `ui/07-helper-work`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`TaskHelperView`, `OfferView`, `InviteView`, `AvailabilityPostView`), §5, §6 (offer and invite actions), §7 (`desk.open.*`, `invite.*`, `availability.*`), §12 (`reward.acceptance`)
- `docs/codex/design-system.md` §4.2, §5, §6
- `docs/blueprint/02-sitemap-and-journeys.md` J2, J3
- `docs/blueprint/03-state-machines.md` §3
- `docs/blueprint/05-rewards.md` §2 (acceptance reward, shown only when its flag is on)

## Build
1. **`/app` (helper mode).**
   - Today's and upcoming bookings.
   - Invites waiting, with their expiry.
   - An offers summary and an earnings snapshot.
   - Availability posts.
   - The `BookableGate` banner when the helper isn't bookable.
2. **`/app/find-work`.**
   - List/map toggle. The map is `AreaMapPlaceholder` with dots at the public points.
   - Filters: category, date, distance band, budget, remote. Sort: newest, soonest, budget.
   - The helper variant of `TaskCard`: distance band, posted time, offer count, and a "You offered" chip.
   - Helpers who aren't bookable still see cards, but the offer CTA is disabled with the reason.
   - Empty state.
3. **`/tasks/[taskSlug]`, helper view** (same route as prompt 03, switched on the viewer).
   - Full description, structured details, a photo gallery with alt text, expense allowance info, and the poster's trust signals.
   - The sentence "You'll see the exact address after the booking is confirmed."
   - The offer CTA. If the helper already offered, show their offer card with **Revise** and **Withdraw** instead.
4. **Offer form** (a bottom sheet on phones, a side panel on desktop).
   - Fixed price: accept the budget or propose a price. Hourly: rate and cap.
   - Proposed start within the window.
   - Message (500 characters). It shows a live warning when it detects contact details: "Phone numbers and emails are hidden until the booking is confirmed."
   - A "what I'll bring" checklist.
   - Live **"You'll earn $54.00"** from `fees.ts` (helper variant), and the expiry ("Your offer expires Sat, Nov 21 · 10:00 am").
   - Submitting runs the mock action and shows a toast.
5. **`/app/offers`**, with tabs **Offers** and **Invites**.
   - **Offers:**
     - Grouped as pending, stale (re-confirm or revise), and accepted (links to the booking).
     - Declined, expired, and withdrawn are collapsed.
   - **Invites:**
     - Cards show the funded hold ("Card hold placed: $49.50 — accepting confirms the booking"), an expiry `Deadline`, and the poster's trust signals.
     - The invite sheet opens at `?invite=<id>`. It shows the details, the helper variant of `PriceBreakdown`, and the actions **Accept**, **Decline** (optional reason), and **Counter** (new price and/or time, plus a message).
     - With `reward.acceptance` on, show an acceptance chip: "+$2.25 pending" (5% of $45).
6. **`/app/availability`.**
   - A list plus a create/edit sheet: date, start and end time, categories (only ones the helper offers), area radius, pricing.
   - Statuses: active, held by a request, booked, expired, canceled. Posts can be canceled.

## Tests
- E2E as Jordan:
  - Feed filters; open the desk task.
  - Submit an offer (live earnings $54.00), revise it, withdraw it.
  - Re-confirm in `desk.open.offers_stale`.
  - Accept an invite → `bookshelf.confirmed`.
  - Decline an invite; counter $50 → `invite.countered`.
  - Create an availability post.
- E2E as Priya (not bookable): gating is enforced.
- **Privacy:** as Sam, the desk task's helper view contains neither "1234 Example Lane" nor "Buzz 2B".
- axe on every screen at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
The poster's request page (prompt 08) and the booking page (prompt 09).

## Review (for the human)
As Jordan: `/app/find-work` → the desk task → send an offer. Then `/app/offers` with `invite.sent`: accept, decline, and counter.
