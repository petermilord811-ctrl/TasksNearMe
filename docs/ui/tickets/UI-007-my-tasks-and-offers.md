# UI-007 — My tasks, task management, offers and compare

**Status:** ready for Codex · **Branch:** `ui/UI-007-my-tasks-and-offers` · **Plan first:** no (unattended) · **Depends on:** UI-006 (merged)

## Goal
The poster's side of tasks and offers (blueprint 02 J1 result and J2; 03 §2–3):
- `/app/tasks`: my tasks.
- `/app/tasks/[taskId]`: manage a task, read offers, compare them.
- `/app/tasks/[taskId]/offers/[offerId]`: one offer in full.

Claude wires them inside `AppShell`. The booking confirmation page that "Book helper" leads to is UI-010.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-007.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.2 (shared components), §5 (status labels and tones), §6, §7
- `docs/blueprint/03-state-machines.md` §2–3 (task and offer states: who can do what)
- Contracts:
  - **`src/contracts/offers.ts`:** `OfferView`, `MyTasksPageData`, `OwnerTaskRow`, `TaskOwnerView`, `OfferDetailPageData`, `TaskOwnerHandlers`, `TASK_CANCEL_REASONS`.
  - `action-ids.ts`: `OFFER_ACTION_IDS` and the new `TASK_ACTION_IDS`.
  - `actions.ts`: the new disabled reason `awaiting_other_party`.
  - `messaging.ts` (`MessageSegment`: render with `MaskedText`), `money.ts`, `location.ts` (`ExactAddress`), `people.ts`, `posting.ts` (`CATEGORY_DETAIL_FIELDS` to label `details`), `routes.ts`.
- Fixtures: **`src/fixtures/offers.ts`** (offers, owner views in every state, my tasks, offer detail, `fakeTaskOwnerHandlers`), plus `posting.ts`, `locations.ts`, `marketing.ts`, `people.ts`.

## Contract changes since UI-006 (main is green; please review the placeholder copy)
- New `TASK_ACTION_IDS` (`cancel_task`, `edit_task`, `invite_helpers`, `post_again`). Placeholder labels are in `actions.json`.
- New disabled reason `awaiting_other_party`. Placeholder copy is in `actionReasons.json`.
- Pending from the UI-004 review, if not already done in UI-006: `waitlist.marketsTitle` names Austin; derive it from `data.markets`.

## Follow-ups from UI-006 (contract requests accepted)
1. **Yard details:** `work` replaces `hauling` with `debris`; `haulAway` is gone; new required `greenWastePlan` (`curbside` / `poster_handles`). Placeholder copy is in `postTask.json`; please review it.
2. **`PostTaskHandlers.onResolvePhotos`** (optional): when a draft is restored from storage, call it with the saved `photoIds` to show real thumbnails instead of placeholders.
3. **`PostTaskPageData.draftStorageKey`** (optional): use it as the sessionStorage key when present (it's scoped to the signed-in person), instead of the fixed `tasksnearme:post-task:<market>:v1`.

## Build

**Screens** (`src/ui/screens/tasks/`). Each has one H1 and takes `now: ISODateTime` where it shows relative times.

| Screen | Props | Content |
|---|---|---|
| `MyTasksScreen` | `data: MyTasksPageData`, `now` | Tabs **Open** / **Booked** / **Past** with counts. Rows link to `routes.app.task(id)` (booked rows: `routes.app.booking(bookingId)` when set). Each row shows the category icon, title, status badge (design-system §5), date and window, budget, "3 offers" with a **"1 new"** badge, and "Posted 2 days ago". Empty states per tab; the empty Open tab has **Post a task** (`routes.app.newTask()`) |
| `TaskManageScreen` | `data: TaskOwnerView`, `handlers: TaskOwnerHandlers`, `now` | **Header:** title, status badge, category, date and window, budget, and posted time. **Task actions** from `data.actions` (`ActionBar` or a menu): `cancel_task` opens a sheet with a reason radio group (`TASK_CANCEL_REASONS`) → `onCancelTask`; other ids → `onTaskAction`. **Offers** (the main content): a count, then `OfferCard`s. Sort: newest / lowest price; default as given. **Compare:** select 2–3 offers → a comparison view (a side-by-side table on desktop, stacked cards on phones) of price, what you'd pay (`breakdown.posterTotalCents`), proposed start, rating, completed tasks, badges, and what they bring. No offers: an empty state ("We've let helpers near Mueller know"). Booked: a notice linking to `routes.app.booking(bookingId)`. **Your task** (collapsible on phones): full description; details labeled from `CATEGORY_DETAIL_FIELDS`; photos (gallery); **your address** with `ExactAddressPanel` (it's the poster's own); the expense allowance |
| `OfferDetailScreen` | `data: OfferDetailPageData`, `handlers: Pick<TaskOwnerHandlers, 'onOfferAction'>`, `now` | Back link to the task. `HelperCard` (full). The offer: price, proposed start, message (`MaskedText`, with a note when something was hidden: "Contact details are shared after you book"), what they bring, expires in…, revision ("Updated offer"). `PriceBreakdown` (poster variant) "What you'll pay if you book". Actions from `offer.actions` → `onOfferAction` (follow `redirectTo`). "Compare with 2 other offers" links back to the task's compare view |

**Components** (export from `src/ui/components/index.ts`):

| Component | File | Props | Notes |
|---|---|---|---|
| `OfferCard` | `components/offers/offer-card.tsx` | `offer: OfferView`, `now`, `selectable?: { selected: boolean; onToggle(): void }`, `onAction` | Helper (initials, name, rating, badges compact), price, proposed start ("Sat 10:00 am"), a two-line message excerpt (`MaskedText`), "New" badge when `isNew`, offer status badge for non-pending, expiry ("Expires in 2 days"), and actions from `offer.actions` (disabled ones show their reason). Links to `routes.app.offer(taskId, id)` |
| `OfferComparison` | `components/offers/offer-comparison.tsx` | `offers: OfferView[]`, `now` | As described above; accessible table semantics on desktop |

Copy namespaces: `myTasks`, `taskManage`, `offers`. Never "hire" or "bid": helpers make **offers**, posters **book**.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-my-tasks/default`, `/empty` | `myTasksPageData`, `myTasksEmptyData`; `now` = `2026-11-17T15:00:00.000Z` | Tabs, new-offer badge, empty states |
| `screen-task-manage/offers`, `/no-offers`, `/stale-offer`, `/booked`, `/remote` | `deskOwnerView`, `deskOwnerNoOffersView`, `deskOwnerStaleView`, `deskOwnerBookedView`, `remoteOwnerView` | Every owner state |
| `screen-task-manage/compare` | `deskOwnerView` with all three offers selected (preview-only initial selection prop) | Comparison |
| `screen-task-manage/cancel-sheet` | `deskOwnerView`, sheet open | Cancel with a reason |
| `screen-offer-detail/default`, `/masked-message` | `deskOfferDetailData`, and the same with `offer: deskOfferLee` | Detail; masked phone |
| `offer-card/new`, `/stale`, `/declined` | `deskOfferJordan`, `deskOfferSamStale`, a declined variant | — |

## Tests
- `MyTasksScreen`: tab counts; the "1 new" badge; booked rows link to the booking; the empty Open tab offers Post a task.
- `TaskManageScreen`: cancel requires a reason and calls `onCancelTask({ reason })`. `invite_helpers` calls `onTaskAction` and follows `redirectTo`. Selecting two offers shows the comparison with $66.00 and $60.50. Sort by lowest price puts Lee ($50) first.
- `ExactAddressPanel` renders only inside `TaskManageScreen`'s "your task" section; no address text appears in `OfferCard` or `OfferComparison` (render them with the desk fixtures and assert "1234 Example Lane" is absent).
- `OfferDetailScreen`: the masked phone shows the hint, never digits beyond it. Book calls `onOfferAction({ offerId: 'off_jordan', action: 'book_offer' })` and pushes `redirectTo`. A stale offer's Book button is disabled with the `awaiting_other_party` reason.
- Copy exists for every `TASK_CANCEL_REASONS` entry and every offer status. Banned words ("hire", "bid", "wages").

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). The UI never decides which actions exist; it renders `actions`.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-007.md`.

## Out of scope
The booking confirmation and payment (UI-010), the offer message thread (UI-014), editing a task (later), the helper's side of offers (UI-009), and home dashboards plus browse/saved helpers (moved to UI-023).

## Claude wiring notes (after review)
- Offers module: schema, domain actions (`getOfferActions`, `getTaskOwnerActions`), the owner projections (masking, poster breakdowns via the fee engine), seeded offers on the desk, cancel with reason (outbox and audit), and `isNew` via an offer-seen marker.
