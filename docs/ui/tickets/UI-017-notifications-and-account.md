# UI-017 — Notifications and the account page

**Status:** ready for Codex · **Branch:** `ui/UI-017-notifications-and-account` · **Plan first:** no (unattended) · **Depends on:** UI-015 (merged)

## Goal
The app shell already links to `/app/notifications` (the bell) and `/app/account` (the account menu), but both pages are missing (blueprint 02 §1.2):
- **Notifications:** what happened on your offers, bookings, payments and messages, newest first, each linking to where it happened; mark all as read.
- **Account:** your name, email, and phone (masked); notification preferences by topic and channel; whether you're a helper (with a link to the helper profile or onboarding); privacy (request a copy of your data, request deletion); sign out.

Support cases, reporting and blocking are a later ticket. Claude wires both pages inside `AppShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-017.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- Contracts:
  - **`src/contracts/account.ts`:** `NOTIFICATION_TYPES`, `NotificationView`, `NotificationsPageData`, `NotificationHandlers`, `NOTIFICATION_TOPICS`, `NOTIFICATION_CHANNELS`, `AccountPageData`, `accountProfileInputSchema`, `AccountProfileInput`, `AccountHandlers`.
  - `home.ts` (`AttentionTarget`: notifications link the same way the home's attention items do), `routes.ts` (`helperProfile`, `helperOnboarding`, `legal('privacy')`, `home`).
- Fixtures: **`src/fixtures/account.ts`**: `mayaNotificationsData`, `jordanNotificationsData`, `notificationsEmptyData`, `mayaAccountData`, `jordanAccountData`, `newAccountData`, `fakeNotificationHandlers`, `fakeAccountHandlers`.
- Reuse: the home's attention-target links (UI-023), `EmptyState`, `PageHeader`, `Switch`, `FormFeedback`, `AlertDialog`.

## Build

**Screens** (`src/ui/screens/account/`, exported from `src/ui/screens/account/index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `NotificationsScreen` | `data: NotificationsPageData`, `handlers: NotificationHandlers`, `now` | "Notifications", with **Mark all as read** (only when `unreadCount > 0`). Rows, newest first: an icon per type, copy per `type` with `title`, `actorName` and `params` ("Jordan T. is running 10 minutes late for Assemble a desk", "You were paid $62.00"), the relative time, and unread rows marked. Opening a row calls `onOpen({ notificationId })` and follows the link built from `target`, as the home does. Empty: "No notifications yet" |
| `AccountScreen` | `data: AccountPageData`, `handlers: AccountHandlers` | "Account". **Profile:** first and last name (form with `accountProfileInputSchema`; the display name shows as "Maya R." and updates after saving), the email (read-only), the phone ("•••• 0101 · Verified", or "Add a phone number" without one). **Notifications:** a table of topics × channels with switches. Locked switches are on and disabled, with "Receipts and safety messages can't be turned off". **Helper:** by `helper.status`: `none` → "Become a helper" (`routes.app.helperOnboarding()`); `draft` → "Finish your helper profile"; `active` / `paused` → "Edit your helper profile" (`routes.app.helperProfile()`); `suspended` → "Your helper account is suspended. Contact support". **Privacy:** **Request a copy of my data** (once requested: "Requested Nov 20 · we'll email it within 30 days") and **Delete my account** (asks first; once requested: "Deletion requested Nov 21"). A link to `routes.legal('privacy')`. **Sign out** |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onMarkAllRead` | none | `updated` (refresh) | `unknown` |
| `onOpen` | `{ notificationId }` | `updated` | ignore errors; still follow the link |
| `onSaveProfile` | `AccountProfileInput` | `saved` | `validation_failed` (`firstName`, `lastName`), `rate_limited`, `unknown` |
| `onSavePreference` | `{ topic, channel, enabled }` | `updated` | `not_allowed` (revert the switch), `unknown` |
| `onRequestExport`, `onRequestDeletion` | none | `submitted` | `not_allowed` (deletion with open bookings: "Finish or cancel your open bookings first"), `rate_limited`, `unknown` |
| `onSignOut` | none | `redirectTo` → navigate | `unknown` |

Copy namespaces: `notifications`, `account`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-notifications/{client,helper,empty}` | `mayaNotificationsData`, `jordanNotificationsData`, `notificationsEmptyData` | The list |
| `screen-account/{client,helper,new}` | `mayaAccountData`, `jordanAccountData`, `newAccountData` | The account page |
| `screen-account/{saving,validation-failed,deletion-blocked}` | `mayaAccountData` + handler results | Form and privacy states |

## Tests
- Every `NOTIFICATION_TYPES` value has copy, and every target kind links through the route builders.
- Mark all as read appears only with unread notifications.
- Locked preference switches can't be changed; a `not_allowed` result reverts a switch.
- Deleting asks first; a blocked deletion shows the reason.
- The phone shows only the last four digits.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-017.md`. That file tells Claude you're done.

## Out of scope
- Support cases, reporting and blocking (a later ticket), push notifications, changing the email address, and adding a phone from here (phone verification already lives in posting).

## Claude wiring notes (filled in by Claude after review)
- Route(s): `/app/notifications` and `/app/account` in the `(main)` group (`src/app/(app)/app/(main)/notifications/page.tsx`, `.../account/page.tsx`). The signed-in shell now passes real `unreadMessages` and `unreadNotifications`.
- Queries / actions: `src/modules/notifications/service.ts` (`dispatchNotifications` turns outbox events into notifications, idempotent per event and person; unread messages in one thread make one notification; `getNotificationsPage`, `getAccountPage`, profile, preferences with bookings and payments email locked on, export and deletion requests; deletion waits while either side has an open booking) and `actions.ts`. `sendMessage` now writes a `message.sent` outbox event. `unreadMessageCount` in messaging feeds the badge.
- e2e: `tests/e2e/account.spec.ts` (notifications link to their booking; mark all as read and the bell's count; the phone stays masked; locked receipts; a preference saves across reloads). Integration: `tests/integration/notifications.test.ts`.
