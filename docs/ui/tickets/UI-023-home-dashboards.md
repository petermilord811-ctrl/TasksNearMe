# UI-023 — The home dashboards (client and helper)

**Status:** ready for Codex · **Branch:** `ui/UI-023-home-dashboards` · **Plan first:** no (unattended) · **Depends on:** UI-030 (merged)

## Goal
`/app` is the first page after signing in (blueprint 02 §1.2): **"Needs your attention"**, then what's coming up. The mode switch decides which dashboard shows:
- **Client:** work to approve, offers to review, a payment to finish, an answer the helper is waiting for, unread messages; upcoming bookings; open tasks; **Post a task**.
- **Helper:** today's check-in, offers to re-confirm, finishing setup, a payout problem, unread messages; upcoming bookings; active offers; nearby tasks; earnings at a glance; **Find work**.

Browse and saved helpers move to UI-015. Claude wires the page inside `AppShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-023.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` §1.2 (`/app`: "Needs your attention")
- Contracts: **`src/contracts/home.ts`** (`AttentionTarget`, `ATTENTION_KINDS`, `AttentionItem`, `PosterHomeData`, `HelperHomeData`, `AppHomePageData`), plus the row types it reuses: `BookingListRow` (`bookings.ts`), `OwnerTaskRow` (`offers.ts`), `MyOfferRow`, `FindWorkCard`, `HelperSetupState` (`helper-work.ts`), and `routes.ts`.
- Fixtures: **`src/fixtures/home.ts`**: `mayaHomeData`, `posterHomeEmptyData`, `jordanHomeData`, `jordanHomePayoutActionData`, `priyaHomeData`.
- Reuse: the booking row from `BookingsScreen` (UI-011), the task row from `MyTasksScreen` (UI-007), the offer row from `MyOffersScreen` (UI-009), `PublicTaskCard` with the find-work footer, `Money`, `EmptyState`.

## Build

**Screen** (`src/ui/screens/home/home-screen.tsx`, exported from `src/ui/screens/home/index.ts`):

| Screen | Props | Content |
|---|---|---|
| `HomeScreen` | `data: AppHomePageData`, `now: ISODateTime` | One H1, a greeting with `firstName` ("Good morning, Maya", by market time of day). Then the dashboard for `data.mode` |

**"Needs your attention"** (both modes, first): one row per `AttentionItem`, in the order given. Each row has an icon, copy per `kind` (with `title`, `count` and `dueAt`: "Approve the desk by Tue 11:48 am", "2 new offers on Mount two floating shelves", "3 unread messages", "The desk starts today at 10:30 am"), and a link. The link is built from `target` with the route builders:
- `booking` → `routes.app.booking(bookingId)`;
- `task` → `routes.app.task(taskId)`;
- `thread` → `routes.app.thread(threadId)`;
- `messages` → `routes.app.messages()`;
- `find_work_task` → `routes.app.findWorkTask(taskId)`;
- `onboarding` → `routes.app.helperOnboarding(step)`;
- `earnings` → `routes.app.earnings()`.

`payout_action_needed` and `finish_setup` are emphasized. When the list is empty: "You're all caught up".

**Client dashboard:** **Upcoming** bookings (up to 3, link "All bookings"), **Open tasks** (up to 3, link "My tasks"), and a prominent **Post a task** (`routes.app.newTask()`). Empty: a friendly start with Post a task.

**Helper dashboard:**
- Earnings at a glance ("$75.00 upcoming · $110.25 on the way", link "Earnings").
- **Upcoming** bookings.
- **Active offers** (up to 3, link "My offers").
- **Nearby tasks** (up to 3 `PublicTaskCard`s with the find-work footer, linking to `routes.app.findWorkTask(id)`; link "Find work").
- While `!setup.bookable`, a setup banner linking to `routes.app.helperOnboarding(setup.nextOnboardingStep)`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-home/client` | `mayaHomeData` | Approve, offers, messages; upcoming; open tasks |
| `screen-home/client-empty` | `posterHomeEmptyData` | All caught up; post a task |
| `screen-home/helper` | `jordanHomeData` | Check in today, re-confirm, a message; earnings; offers; nearby tasks |
| `screen-home/helper-payout-action` | `jordanHomePayoutActionData` | The payout problem first |
| `screen-home/helper-not-set-up` | `priyaHomeData` | Finish setup; tasks to browse |

## Tests
- Every `ATTENTION_KINDS` value has copy, and every `AttentionTarget` kind links through the right route builder.
- The dashboard follows `data.mode`; the client never sees earnings, and the helper never sees "Post a task" as the main action.
- Empty sections show their empty state, not an empty list.
- The greeting uses market time (morning, afternoon, evening).

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No business rules (the attention list comes from the data), no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-023.md`. That file tells Claude you're done.

## Out of scope
- Browsing and saved helpers (UI-015), notifications (UI-017), and rewards (UI-028).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
