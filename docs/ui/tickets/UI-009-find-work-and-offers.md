# UI-009 — Find work, task view for helpers, make and manage offers

**Status:** ready for Codex · **Branch:** `ui/UI-009-find-work-and-offers` · **Plan first:** no (unattended) · **Depends on:** UI-008 (merged)

## Goal
The helper's side of the marketplace (blueprint 02 J2):
- `/app/find-work`: open tasks near the helper, with distance bands and filters.
- `/app/find-work/[taskId]`: a task from the helper's side, with the offer form or the helper's own offer.
- `/app/offers`: the helper's offers.

Only bookable helpers can send offers. Everyone else sees why, plus a link to finish setup. Claude wires the screens inside `AppShell` (helper mode).

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-009.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` **J2** (feed, task detail, offer rules), `03-state-machines.md` §3 (offer states and what the helper can do)
- Contracts:
  - **`src/contracts/helper-work.ts`:** `FindWorkPageData`, `FindWorkQuery`, `FIND_WORK_DISTANCES`, `FindWorkCard`, `OFFER_BLOCKED_REASONS`, `HelperTaskView`, `HelperOfferView`, `OfferRules`, `createOfferInputSchema(rules)`, `OfferInput`, `HelperWorkHandlers`, `MyOffersPageData`.
  - `tasks.ts` (`TaskPublicView`; `location.distanceBand` is set for helpers), `location.ts` (`DISTANCE_BANDS`), `money.ts` (helper variant of `PriceBreakdown`), `action-ids.ts` (`OFFER_ACTION_IDS`), `routes.ts` (`findWork`, `findWorkTask`, `offers`, `helperOnboarding`).
- Fixtures: **`src/fixtures/helper-work.ts`**: Jordan's feed, not bookable, empty; four task views and a stale offer; my offers; `fakeHelperWorkHandlers`.
- Reuse: `PublicTaskCard`, `PriceBreakdown` (helper variant), `ActionBar`, the forms pattern, and `parseMoneyInput` for dollar fields.

## Follow-ups from UI-008 (contract requests accepted)
1. `onUploadWorkSample` now resolves with **`sample`** (the stored `WorkSampleView`), as well as `photo`. Use `sample` so a new upload can be captioned, reordered, or removed without a refresh.
2. `HelperProfileEditorData.maxPhotoMegabytes`: explain and check the size limit before uploading.

## Build

**Screens** (`src/ui/screens/work/`). Each has one H1 and takes `now` where it shows relative times.

| Screen | Props | Content |
|---|---|---|
| `FindWorkScreen` | `data: FindWorkPageData`, `now` | **Setup banner** when `!setup.bookable`: "Finish setting up to send offers", linking to `routes.app.helperOnboarding(setup.nextOnboardingStep)`. **Filters:** the board's filters plus **distance** (`FIND_WORK_DISTANCES`: Any distance / Within 2 / 5 / 10 miles). Each filter is a link to `routes.app.findWork()` with query params `category`, `when`, `remote=1`, `sort`, `page`, `distance` (defaults omitted, page reset on change). **Cards:** `PublicTaskCard`, plus the distance band ("About 2 mi away"), "You made an offer" or the offer status when `myOffer` is set, or the blocked reason when `blockedReason` is set ("You don't offer this service", "Needs a background check", …). Cards link to `routes.app.findWorkTask(task.id)`. Pagination and an empty state (with a link to clear filters) |
| `HelperTaskScreen` | `data: HelperTaskView`, `handlers: HelperWorkHandlers`, `now` | Title, category, the area and distance band (never an address), date and window, budget, and posted time. The full description, details (labeled from `CATEGORY_DETAIL_FIELDS`), photos (gallery), and the expense allowance. The poster card (name, phone verified, member since). Then **one of:** **(a) the blocked reason** (with the setup link when `not_bookable`); **(b) your offer** (`HelperOfferView`: status, price, start, message, brings, expiry, revision, `PriceBreakdown` helper variant "What you'll earn", actions from `myOffer.actions`; `revise_offer` opens the form prefilled with the offer, and `withdraw_offer` / `reconfirm_offer` → `onOfferAction`); or **(c) the offer form** |
| `MyOffersScreen` | `data: MyOffersPageData`, `now` | Tabs **Active** / **Booked** / **Closed** with counts. Rows show the task title (link to `routes.app.findWorkTask(task.id)`), category, date, your price, what you'll earn, status badge, expiry ("Expires in 2 days"), and "Updated offer" when revision > 1. Empty states link to `routes.app.findWork()` |

**Offer form** (inside `HelperTaskScreen`): react-hook-form with `zodResolver(createOfferInputSchema(data.offerRules))`, prefilled from `offerDefaults` (or `myOffer` when revising).
- **Price:** fixed → task price in dollars; hourly → rate, estimated hours, and cap (0.5 steps). The pricing type is fixed by `offerRules.pricingType`.
- **Start:** a select from `offerRules.startTimes` (shown as "10:00 am").
- **Message:** counter, max `messageMaxLength`. Add a note that phone numbers and emails are hidden until the poster books.
- **What you'll bring:** add and remove chips, max 10.
- **Live earnings:** debounce price changes into `onQuote({ pricing })` and show `PriceBreakdown` (helper variant). Never compute fees.
- **Submit** → `onSubmitOffer` (or `onReviseOffer` when revising). Handle `validation_failed` (dotted `fieldErrors`), `not_allowed`, `limit_reached`, and `rate_limited`.

Copy namespaces: `findWork`, `helperTask`, `myOffers`. Never "bid", "job board", "gig", or "hire".

## States to preview
| Preview id | Fixture(s) |
|---|---|
| `screen-find-work/default`, `/not-bookable`, `/empty` | `findWorkPageData`, `findWorkNotBookableData`, `findWorkEmptyData`; `now` = `2026-11-17T15:00:00.000Z` |
| `screen-helper-task/with-offer`, `/offer-form`, `/hourly-form`, `/blocked`, `/stale-offer`, `/revising` | `helperDeskWithOffer`, `helperYardNoOffer`, `helperMovingHourly`, `helperComputerBlocked`, `helperDeskStaleOffer`, and `helperDeskWithOffer` with the revise form open |
| `screen-my-offers/default`, `/empty` | `myOffersPageData`, `myOffersEmptyData` |

## Tests
- `FindWorkScreen`: the distance filter links to `/app/find-work?distance=within_5_mi` and drops `page`; cards show the blocked reason copy for every `OFFER_BLOCKED_REASONS` entry (iterate the constant); the setup banner links to the identity step.
- Offer form: a start outside `startTimes` can't be chosen; "$20" on the desk shows `out_of_range`; submitting calls `onSubmitOffer` with `OfferInput`; the quote is requested with the debounced pricing and shows "$54.00" earnings for $60.
- Revise opens the form with the offer's values and calls `onReviseOffer`; withdraw asks for confirmation and calls `onOfferAction({ offerId, action: 'withdraw_offer' })`.
- No address text (for example "1234 Example Lane") appears anywhere on the helper task screen with the desk fixtures.
- `MyOffersScreen`: tab counts and the "Updated offer" note.
- Banned words.

## Acceptance
- Every item in **Build** and the follow-ups exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). The UI never decides eligibility; it shows `blockedReason`, `setup`, and `actions`.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-009.md`.

## Out of scope
Direct invites and availability posts (UI-010), messaging (UI-014), and maps.

## Claude wiring notes (after review)
- Find-work query: open tasks in the market, distance bands from the helper's area center, blocked reasons per task, and the helper's own offers.
- Offer service: eligibility (bookable per category), one active offer per task, at most 25 active offers, and an expiry at the window start or 72 hours, whichever is first. Revisions mark the offer unseen for the poster. Withdraw, reconfirm, outbox, and audit.
- `HelperTaskView` description masking and the helper quote via the fee engine. Pages in the `(main)` group.
