# Prompt 05 — Poster home, my tasks, offers, browse helpers

**Plan first:** yes · **Depends on:** 02 · **Branch:** `ui/05-poster-tasks`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §2 (Maya), §4 (`TaskOwnerView`, `OfferView`, `HelperSummary`), §5, §6 (offer actions), §7 (`desk.open.*`)
- `docs/codex/design-system.md` §3, §4.2, §5, §6
- `docs/blueprint/02-sitemap-and-journeys.md` J2 (offer rules), J3 (invite entry points)
- `docs/blueprint/03-state-machines.md` §2–§3

## Build
1. **`/app` (poster mode).**
   - A **"Needs your attention"** list from a new `getPosterHome(viewer)` query, covering:
     - offers to review
     - payment to finish
     - invites waiting or countered
     - approvals due
     - unread messages
   - **Post a task** CTA, upcoming bookings, and a saved-helpers row.
   - An empty variant for a new poster (dev toolbar "force empty").
2. **`/app/tasks`.**
   - Tabs: **Open** (offer counts and stale warnings), **Booked** (link to the booking), **Past** (completed, canceled, expired, each with **Post again**).
   - Use the owner variant of `TaskCard`.
3. **`/app/tasks/[taskId]`** (owner view).
   - Status header, plus a summary split into public and private details.
   - Actions:
     - **Edit.** When offers exist, a material edit first warns "Helpers will need to re-confirm their offers".
     - **Cancel task**, with confirmation.
     - **Invite helpers**: suggested helpers linking to the request page.
   - **Offers section.**
     - Sort: recommended, price, rating, response time.
     - Each `OfferCard` shows the price or hourly terms, helper badges, rating, response time, the masked message excerpt, and the proposed time.
     - **Compare**: a side-by-side table on desktop; on phones, a stacked comparison of 2–3 selected offers.
     - Stale offers are flagged.
     - Empty state: "No offers yet. Helpers nearby have been notified. Offers usually arrive within a few hours."
   - Booked state: a link to the booking.
4. **`/app/tasks/[taskId]/offers/[offerId]`** (offer detail, `DetailPageShell`).
   - `HelperCard` with a profile link; offer terms with the poster variant of `PriceBreakdown`.
   - The message, proposed start, what they'll bring, and revision info ("Updated 2 h ago").
   - The last 3 thread messages (masked), plus **Open conversation**. Prompt 12 builds the full thread.
   - Actions from `offer-actions`:
     - **Book Jordan** goes to `/confirm`, which prompt 08 builds. A stub is fine for now.
     - **Decline** (optional reason).
     - **Message.**
5. **`/app/helpers`** (browse).
   - Filters: category, distance band, has availability, minimum rating.
   - `HelperCard` list. Each card links to the public profile and to **Request booking**.
6. **`/app/saved`.** Saved helpers, each with **Book again** (goes to the request page) and **Remove**. Empty state.

## Tests
- E2E as Maya on `desk.open.offers`:
  - Sort by price and compare offers.
  - Decline Lee's offer.
  - Open Jordan's offer; **Book Jordan** navigates to `/confirm`.
- `desk.open.offers_stale` shows the stale warnings.
- Offer messages render masked.
- axe on every page at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Booking confirmation and payment (prompt 08), and the full conversation view (prompt 12).

## Review (for the human)
As Maya, open `/app` and `/app/tasks/<desk id>` in both `desk.open.offers` and `desk.open.offers_stale`, at phone width.
