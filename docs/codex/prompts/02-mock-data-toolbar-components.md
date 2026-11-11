# Prompt 02 — Mock data, dev toolbar, shared components

**Plan first:** yes · **Depends on:** 01 · **Branch:** `ui/02-mock-data`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md`, **all of it** (this prompt implements it)
- `docs/codex/design-system.md` §4.2, §5, §6
- `docs/blueprint/03-state-machines.md` §4–§6 and §8 (states and actions)
- `docs/blueprint/04-payments-and-fees.md` §3 and §6 (fee and cancellation numbers)
- `docs/blueprint/08-data-model-and-access.md` §4 (staff limits)

## Goal
All mock data, the scenario system, the domain functions, and the shared components exist and are tested. After this, every screen is built by composing these pieces.

## Build
1. **Types.** Every type and enum from ui-contract §4 goes in `src/modules/<module>/types.ts`, split by module and re-exported from each module's `index.ts`.
2. **Fixtures** in `src/mocks/`:
   - People (§2); places, areas, and categories; market config (§11, policy v1 published and v2 draft).
   - Tasks, offers, invites, availability posts, and bookings with terms history.
   - Changes, completions, payments, refunds, earnings, payouts, rewards, reviews, threads, messages, notifications, and cases.
   - Admin data: queues, ledger journals, audit entries, reward programs.
   - Fixture photos as simple SVGs in `public/fixtures/`: boxed desk, assembled desk, drawer close-up, yard, receipt.
3. **Scenarios.** `src/mocks/scenarios.ts` implements **every** scenario id in ui-contract §7, each with its `now`, default viewer, and data. `src/mocks/transitions.ts` implements §8.
4. **Platform.**
   - `src/platform/viewer.ts`: reads the viewer from the cookie or the `as` query parameter, replacing the prompt 01 stub. The mode switch now writes that cookie.
   - `src/platform/clock.ts`: `getNow()` from the scenario, overridable with `now`.
   - `src/platform/flags.ts`: the §12 flags, with cookie overrides in dev.
   - `src/platform/format/`: money, date and time in `America/Chicago`, ranges, relative deadlines, distance bands, and durations. Unit-test all of them, including the DST changes on Nov 1, 2026 and Mar 14, 2027.
5. **Queries** (mock-backed, final signatures) in each module's `queries.ts`. Examples: `getPublicTask(slug)`, `getTaskForViewer(id, viewer)`, `listOpenTasks(filters, viewer)`, `getBookingForViewer(id, viewer)`, `listBookings(viewer, filter)`, `listThreads(viewer)`, `getThread(id, viewer)`, `getEarnings(viewer)`, `getRewards(viewer)`, `getAdminQueues(viewer)`.
   - They **apply ui-contract §5**. When access isn't allowed they return `null`, and the page calls `notFound()`.
6. **Domain functions** (pure, exhaustive unit tests):
   - `payments/domain/fees.ts`: `computeBreakdown(...)` plus helpers for change deltas, hourly final amounts, refunds, the late-cancellation fee, and settlements. **Tests reproduce every row of ui-contract §3.**
   - `bookings/domain/booking-actions.ts`: `getBookingActions(booking, viewer, now)` per §6, including disabled reasons. Test every state × viewer combination.
   - `offers/domain/offer-actions.ts`, `offers/domain/invite-actions.ts`, `rewards/domain/reward-actions.ts`.
   - `admin/domain/permissions.ts`: refund up to $100 for an agent and $500 for a lead; finance dual approval above $500; reversals finance only; config and staff admin only.
   - `tasks/domain/address-visibility.ts`: `canSeeExactAddress(booking, viewer, now)` per §5. Tests include the 48-hour boundary.
   - `messaging/domain/contact-details.ts`: detect and mask phone numbers and emails, tested against a corpus of examples.
7. **Mock server actions.**
   - Each module gets `actions.ts`, which calls a shared `runMockAction(actionId, input)`.
   - `runMockAction` validates with zod, applies the transition (sets the scenario cookie), revalidates, and returns `{ ok, message }`.
   - Simulate 400–900 ms of latency. The toolbar's "force error" makes actions fail with a friendly message.
8. **Dev toolbar** in `src/dev/`, per ui-contract §9.
   - Fully keyboard accessible, and never rendered in production.
   - Add the routes `/dev/scenarios` and `/dev/components`. They return 404 in production; guard them in both the route and a layout.
9. **Shared components** from design-system §4.2. Show each one, with all its variants (including loading skeletons), on `/dev/components`.
10. Switch the route stubs from the prompt 01 placeholder viewer to the real viewer.

## Tests
- **Unit:** fees (every §3 row), action matrices, address visibility, contact masking, formatters, staff permissions.
- **Component:** `PriceBreakdown` shows $66.00 (poster) and $54.00 (helper) for the desk; `StatusBadge` labels follow design-system §5 for each viewer.
- **E2E:**
  - `/dev/scenarios` lists every scenario, and opening `desk.confirmed` as Jordan sets both viewer and scenario.
  - `/dev/components` passes axe.
  - `/dev/*` returns 404 in a production build. If running a production server in tests is impractical, unit-test the guard instead and say so in your summary.

## Acceptance
Definition of done in AGENTS.md. Update the Foundations section of `docs/ui-progress.md`.

## Out of scope
Real screens. Build only the gallery and the scenarios page.

## Review (for the human)
Open `/dev/components` at phone and desktop widths. Then open `/dev/scenarios` and click into several scenarios as different viewers. Check that the toolbar switches and remembers your choice.
