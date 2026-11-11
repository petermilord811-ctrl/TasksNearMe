# Prompt 13 — Reviews and repeat business

**Plan first:** no · **Depends on:** 11 · **Branch:** `ui/13-reviews-repeat`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`ReviewView`, `RewardGrantView.relationship`), §6 (`review`, `save_helper`, `book_again`, `offer_rebook`), §7 (`desk.completed`, `desk.completed.reviewed`, `rewards.repeat_progress`), §12
- `docs/codex/design-system.md` §4.2 (`ReviewCard`, `RatingStars`), §6
- `docs/blueprint/02-sitemap-and-journeys.md` J8
- `docs/blueprint/05-rewards.md` §2 (repeat reward)
- `docs/blueprint/06-verification-trust-compliance.md` §5, F12 (no incentives tied to reviews; no suppressing reviews)

## Build
1. **`/app/bookings/[bookingId]/review`** (both roles).
   - **Rating** 1–5 as an accessible radio group drawn as stars.
   - **Tags, by role:**
     - Client reviewing a helper: On time, Careful, Friendly, Tidy, Great value.
     - Helper reviewing a client: Clear instructions, Easy access, Respectful, Ready on time.
   - **Text:** optional, up to 1,000 characters.
   - **Double-blind note:** "Your review stays hidden until Jordan also reviews, or until Sat, Dec 5."
   - After submitting, the page shows the submitted state. Once both reviews are in, it shows both. Published reviews can't be edited, but they can be reported.
   - **No reward or incentive wording anywhere near reviews.** Test for this.
2. **Reviews elsewhere.**
   - The public helper profile (prompt 03) lists published reviews.
   - Helpers see a client's rating as "Rating as a client 5.0 (1)".
3. **Save helper** toggles on the profile, the completed booking, and the offer detail, each with a toast. Polish `/app/saved`.
4. **Book again** from the completed booking and the published-review screen goes to `/app/helpers/[handle]/request?from=booking:<id>`. Prompt 14 adds the same link to receipts.
5. **`/app/clients`** (helper).
   - Past clients: name, number of bookings, last booking date, total earned together.
   - With `reward.repeat` on, show progress: "2 of 3 paid bookings with Maya — your 3rd earns a $10 gift card."
   - **Offer to rebook** opens a proposal sheet: task details, time, price, message. It shows what the client would pay and what the helper would earn.
   - Sending creates an invite with `source: 'client_proposal'`.
   - **Poster side:** a "Jordan proposed a booking" card in the `/app` attention list and in messages. **Accept and pay** opens the request page in authorize mode, pre-filled.

## Tests
- E2E:
  - Both reviews submitted → published.
  - The double-blind state.
  - The review page contains no reward or gift-card wording.
  - Repeat progress on the clients list.
  - Rebooking proposal → poster accepts and authorizes.
  - Save and unsave.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Changing how review data is stored, and any form of review incentive.

## Review (for the human)
From `desk.completed`, review as Maya, then as Jordan, and check the published state. Then open `/app/clients` as Jordan with `rewards.repeat_progress`.
