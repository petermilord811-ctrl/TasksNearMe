# UI-020 — Admin: reward reviews and people

**Status:** ready for Codex · **Branch:** `ui/UI-020-admin-rewards-and-people` · **Plan first:** no (unattended) · **Depends on:** UI-018, UI-019

## Goal
Two staff tools the launch needs (backlog B-053, B-056, B-057):
- **Reward reviews** (`routes.admin.rewards(filter)`). At launch, every welcome reward is reviewed after its 7-day hold, because a self-dealing pair profits from it (blueprint 05 §1, §3).
  - The queue shows each grant with its booking, both people, and the risk signals.
  - **Approve** (a lead) makes it redeemable, and **Reject** voids it. **Void** and **Reissue** (for failed deliveries) are for agents.
  - Each decision needs a note, which goes to the audit log.
  - Program budgets show what's committed and delivered.
- **People** (`routes.admin.users(query)`, `routes.admin.user(userId)`): search by name or email. A person's page shows their bookings (as client and helper), cases, rewards and strikes. Trust and safety, leads and admins can **suspend** a helper, which withdraws their active offers and hides them from search, or **reinstate** them, with a reason.

Claude wires the pages inside `AdminShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-020.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §7 (admin density)
- `docs/blueprint/05-rewards.md` §1 (abuse controls), §3 (the self-dealing pair)
- Contracts:
  - **`src/contracts/admin-people.ts`:**
    - rewards: `REWARD_RISK_SIGNALS`, `ADMIN_REWARD_FILTERS`, `StaffRewardActionId`, `AdminRewardRow`, `AdminRewardsPageData`, `rewardDecisionInputSchema`, `AdminRewardsHandlers`;
    - people: `AdminUserRow`, `AdminUsersPageData`, `ADMIN_USER_ACTIONS`, `AdminUserPageData`, `helperSuspensionInputSchema`, `AdminUserHandlers`.
  - `admin.ts` (`AdminCaseRow` for the person's cases), `status.ts` (`REWARD_STATUSES`, `REWARD_PROGRAM_CODES`, `BOOKING_STATUSES`), `routes.ts` (`admin.rewards(filter)`, `admin.users(query)`, `admin.user`, `admin.booking`, `admin.case`).
- Fixtures, in **`src/fixtures/admin-people.ts`**:
  - rewards: `adminRewardsReviewData`, `adminRewardsFailedData`, `adminRewardsEmptyData`;
  - people lists: `adminUsersData`, `adminUsersSearchData`, `adminUsersEmptyData`;
  - a person: `adminUserJordanData`, `adminUserSuspendedData`, `adminUserReadOnlyData`;
  - `fakeAdminRewardsHandlers`, `fakeAdminUserHandlers`.
- Reuse: the UI-018 list layout, `StatusBadge`, the reason dialog pattern (UI-018/019), money formatting from `@/shared/format`.

## Build

**Screens** (`src/ui/screens/admin/`, exported from its index). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `AdminRewardsScreen` | `data: AdminRewardsPageData`, `handlers: AdminRewardsHandlers`, `now` | "Rewards". Filter links (`ADMIN_REWARD_FILTERS` with `counts`). **Budgets:** per program, committed and delivered against the budget (a meter when `budgetCents` is set). **Rows:** program and amount, status, the helper, and the booking with its client, price and completion date (links to `routes.admin.booking`, `routes.admin.user`). The hold end, and the **signals** as warning chips ("Both accounts are new", "Same card as the client"…). The actions in `row.actions`: each opens a dialog with a required note (`rewardDecisionInputSchema`), and **Reject** and **Void** say the helper won't get the gift card. Empty: "Nothing to review" |
| `AdminUsersScreen` | `data: AdminUsersPageData`, `now` | "People". A search form (GET, `q`) using `routes.admin.users(query)`. Rows: the person, their email, staff roles, helper status, open cases and strikes, each linking to `routes.admin.user(id)`. Empty: "No one matches" |
| `AdminUserScreen` | `data: AdminUserPageData`, `handlers: AdminUserHandlers`, `now` | The name (H1), member since, email, the masked phone ("•••• 0201 · Verified"), roles, and helper status. The suspension notice when set (reason, when, by whom). **Bookings** (role, status, start, amount; linking to `routes.admin.booking`), **cases** (rows like UI-018's), **rewards** (rows like above, read-only here), **strikes**. The actions in `data.actions`: **Suspend helper** or **Reinstate helper**, each in a dialog with a required reason (`helperSuspensionInputSchema`); suspending says "Their open offers are withdrawn and they're hidden from search" |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onDecide` | `RewardDecisionInput` | `updated` (refresh) | `validation_failed`, `not_allowed`, `unknown` |
| `onSuspension` | `HelperSuspensionInput` | `updated` (refresh) | `validation_failed`, `not_allowed`, `unknown` |

Copy namespaces: `adminRewards`, `adminUsers`, `adminUser`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-admin-rewards/{review,failed,empty,decision-dialog}` | the rewards fixtures | The queue and a decision |
| `screen-admin-users/{default,search,empty}` | the people fixtures | Search |
| `screen-admin-user/{helper,suspended,read-only,suspend-dialog}` | the person fixtures | A person |

All previews use `now = ADMIN_NOW` inside `AdminShell`.

## Tests
- Decisions and suspensions need a note or reason of at least 10 characters and send exactly the schema's fields.
- Only `row.actions` and `data.actions` render.
- Copy exists for every `REWARD_RISK_SIGNALS`, `ADMIN_REWARD_FILTERS`, `REWARD_STATUSES` and `REWARD_PROGRAM_CODES` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or amounts.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-020.md`. That file tells Claude you're done.

## Out of scope
- Bans with a second reviewer, hiding tasks, photos and reviews (content moderation), staff roles and config (later tickets).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
