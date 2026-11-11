# UI-028 — Rewards for helpers

**Status:** ready for Codex · **Branch:** `ui/UI-028-rewards` · **Plan first:** no (unattended) · **Depends on:** UI-002 (shells)

## Goal
Helpers earn gift-card rewards from the promotions budget (blueprint 05): the $50 **welcome** reward for founding helpers' first qualifying booking, and the $10 **repeat** reward for a third paid booking with the same client within 90 days. The account menu and helper navigation link to **Rewards** (`/app/rewards`), which doesn't exist yet. Rewards are never earnings: they appear only on this page.

Claude wires the page inside `AppShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-028.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §5, §6 (money and status), §7
- `docs/blueprint/05-rewards.md` §1–§2 (rules: pending, qualified, 7-day hold, review, redeem within 90 days, $75 a month)
- Contracts: **`src/contracts/rewards.ts`**: `RewardGrantView`, `HelperRewardActionId`, `RewardVoidReason`, `RepeatProgressView`, `RewardProgramView`, `RewardsPageData`, `RewardsHandlers`. Also `status.ts` (`REWARD_STATUSES`, `REWARD_PROGRAM_CODES`) and `routes.ts` (`app.rewards`, `app.booking`, `app.helperOnboarding`, `legal('rewards-terms')`).
- Fixtures: **`src/fixtures/rewards.ts`**: `REWARDS_NOW`, `rewardsPendingData`, `rewardsQualifiedData`, `rewardsRedeemableData`, `rewardsDeliveredData`, `rewardsEmptyData`, `rewardsNotHelperData`, `rewardGrantsByStatus`, `fakeRewardsHandlers`.
- Reuse: `StatusBadge`, money formatting from `@/shared/format`, `EmptyState`, `FormFeedback`, the earnings page layout (UI-016) for tone.

## Build

**Screen** (`src/ui/screens/rewards/`, exported from `src/ui/screens/rewards/index.ts`). One H1.

| Screen | Props | Content |
|---|---|---|
| `RewardsScreen` | `data: RewardsPageData`, `handlers: RewardsHandlers`, `now` | "Rewards". **Totals:** ready to redeem, on the way (pending), redeemed this year. **Your rewards:** a card per grant (below). **Repeat progress:** "2 of 3 paid bookings with Maya R. · by Feb 15" as a progress bar. **This month:** "$60 of $75 used". **How rewards work:** one short line per program in `data.programs` with its numbers (welcome: "$50 for your first booking of $40 or more", repeat: "$10 for your third paid booking with the same client within 90 days"), the hold and expiry rules, "Rewards are gift cards, not earnings", and a link to `routes.legal('rewards-terms')`. Empty (`grants` empty): "No rewards yet". Not a helper (`helperReady` false): an empty state linking to `routes.app.helperOnboarding()` |

**Component** (`src/ui/components/rewards/`): `RewardGrantCard` (`grant: RewardGrantView`, `now`, `onRedeem`). Program name and amount, the booking title linking to `routes.app.booking(id)` (or "With Maya R." for repeat), the status badge, and one line by status:
- `pending`: "Unlocks after the work is completed and paid";
- `qualified`: "Ready on Sat, Nov 28" (`holdUntil`);
- `in_review`: "We're reviewing this reward";
- `redeemable`: "Redeem by Feb 28" (`expiresAt`), plus a **Redeem** button;
- `issuing`: "Your gift card is on its way";
- `delivered`: an **Open gift card** link to `deliveryUrl` (new tab, with an accessible "opens in a new tab");
- `failed`: "Delivery failed. Support will reissue it";
- `voided`: why (`voidReason`);
- `expired`: "Expired on Oct 30".

Only the actions in `grant.actions` render.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onRedeem` | `{ grantId }` | `submitted` (show "Your gift card is on its way"; the page refreshes) | `not_allowed`, `rate_limited`, `unknown` |

Copy namespace: `rewards`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-rewards/{pending,qualified,redeemable,delivered}` | `rewardsPendingData`, `rewardsQualifiedData`, `rewardsRedeemableData`, `rewardsDeliveredData` | The page through the welcome reward's life |
| `screen-rewards/{empty,not-helper}` | `rewardsEmptyData`, `rewardsNotHelperData` | Empty states |
| `screen-rewards/{redeeming,redeem-error}` | `rewardsRedeemableData` + results | Redeem pending and `not_allowed` |
| `component-reward-grant/all-statuses` | `rewardGrantsByStatus` | One card per status |

All previews use `now = REWARDS_NOW`.

## Tests
- Redeem calls `onRedeem({ grantId })` once and shows the result; it's disabled while pending.
- Only `grant.actions` render; the gift card link opens in a new tab with `rel="noopener noreferrer"`.
- Copy exists for every `REWARD_STATUSES`, `REWARD_PROGRAM_CODES` and `REWARD_VOID_REASONS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or amounts.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-028.md`. That file tells Claude you're done.

## Out of scope
- Reward chips on bookings and the helper home, the acceptance and completion programs (off at launch), and the staff reward tools (UI-020).

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/app/rewards` in the `(main)` group.
- Queries / actions: `src/modules/rewards/service.ts` (`getRewardsPage` brings grants up to date with the helper's bookings first; `redeemReward` orders the gift card through the development stand-in) and `actions.ts`.
- e2e: `tests/e2e/rewards.spec.ts` (Jordan's welcome reward is pending after the first paid booking; people who aren't helpers are pointed to helper setup). Integration: `tests/integration/rewards.test.ts`.
