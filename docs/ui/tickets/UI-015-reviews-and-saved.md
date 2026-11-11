# UI-015 — Reviews and saved helpers

**Status:** ready for Codex · **Branch:** `ui/UI-015-reviews-and-saved` · **Plan first:** no (unattended) · **Depends on:** UI-023 (merged)

## Goal
After a completed booking both people review each other (blueprint 02 **J8**), on `/app/bookings/[bookingId]/review`. Reviews are double-blind: each becomes visible when both are in, or 14 days after completion. The client can save helpers and find them again on `/app/saved`.

Browsing helpers, "My clients", and Book again (which needs direct requests) are later tickets. Claude wires the pages.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-015.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` **J8** (double-blind reviews, 1–5 stars, tags, text; low ratings are never hidden)
- Contracts:
  - **`src/contracts/reviews.ts`:** `CLIENT_REVIEW_TAGS`, `ReviewDirection`, `reviewTagsFor`, `createReviewInputSchema`, `ReviewInput`, `REVIEW_UNAVAILABLE_REASONS`, `ReviewPageData`, `ReviewHandlers`, `SavedHelpersPageData`, `SavedHelperHandlers`.
  - `profiles.ts` (`HELPER_REVIEW_TAGS`; reviews already show on profiles); `bookings.ts` (new `BookingView.helperSaved` and `BookingView.myReview`).
- Fixtures: **`src/fixtures/reviews.ts`**: `deskReviewByClientData`, `deskReviewByHelperData`, `deskReviewSubmittedData`, `deskReviewPublishedData`, `reviewUnavailableData`, `mayaSavedHelpersData`, `savedHelpersEmptyData`, `fakeReviewHandlers`, `fakeSavedHelperHandlers`.
- Reuse: `RatingStars`, `HelperCard`, `ReviewCard`, `EmptyState`, the forms pattern.

## Build

**Screens** (`src/ui/screens/reviews/`, exported from `src/ui/screens/reviews/index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `ReviewScreen` | `data: ReviewPageData`, `handlers: ReviewHandlers`, `now` | The heading names who is reviewed ("How was Jordan T.?"), with the task and date. **Form** (`zodResolver(createReviewInputSchema(data.direction))`): a star rating (1–5, an accessible radio group, required), tags from `reviewTagsFor(data.direction)` (toggle chips, up to 5), and optional text (up to 1,000). The note: "Reviews stay hidden until you both send yours, or until Sat, Dec 5." Submit: "Send review". When `mine` is set, show it read-only: "Visible since …" if published, otherwise "Becomes visible when Jordan sends theirs, or on Dec 5". `unavailable` shows a message per reason and a link back to the booking |
| `SavedHelpersScreen` | `data: SavedHelpersPageData`, `handlers: SavedHelperHandlers` | "Saved helpers": `HelperCard`s linking to `routes.helperProfile(handle)`, each with **Remove** (`onToggleSaved({ helperId, saved: false })`). Empty: "Save helpers you'd like to book again", with a link to `routes.app.bookings()` |

**Booking page additions** (`BookingHubScreen`):
- When `helperSaved` is true: show a "Saved" state where the save action would be.
- When `myReview` is set: show "You rated this 5 stars", plus "Visible since …" or "Hidden until they review too".

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onSubmit` | `ReviewInput` | `submitted` + `redirectTo` | `validation_failed` (`rating`, `tags`, `body`), `not_allowed`, `rate_limited`, `unknown` |
| `onToggleSaved` | `{ helperId, saved }` | `updated` (refresh) | `not_found`, `unknown` |

Copy namespaces: `review`, `savedHelpers`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-review/{by-client,by-helper}` | `deskReviewByClientData`, `deskReviewByHelperData` | The form, with each direction's tags |
| `screen-review/{submitted,published}` | `deskReviewSubmittedData`, `deskReviewPublishedData` | Read-only |
| `screen-review/unavailable-<reason>` | `reviewUnavailableData[reason]` | One per reason (2) |
| `screen-review/result-validation-failed` | `deskReviewByClientData` + a result | No rating |
| `screen-saved-helpers/{default,empty}` | `mayaSavedHelpersData`, `savedHelpersEmptyData` | The list |
| `screen-booking/client-completed-saved-reviewed` | `deskBookingPosterCompleted` + `helperSaved: true`, `myReview` | The booking page additions |

## Tests
- The star rating is required, keyboard operable and announced ("4 of 5 stars").
- Tags follow the direction; more than 5 can't be picked.
- Submitting sends `{ rating, tags, body }` and navigates on `submitted`.
- Copy exists for every `CLIENT_REVIEW_TAGS` and `HELPER_REVIEW_TAGS` value and every unavailable reason.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-015.md`. That file tells Claude you're done.

## Out of scope
- Browsing and searching helpers, My clients, Book again (direct requests, UI-025), reporting a review (UI-017).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
