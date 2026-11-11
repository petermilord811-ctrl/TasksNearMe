# UI-026 — Disputes on the booking page, and support notifications

**Status:** ready for Codex · **Branch:** `ui/UI-026-disputes-on-the-booking-page` · **Plan first:** no (unattended) · **Depends on:** UI-011, UI-017, UI-031

## Goal
When a client reports a problem, the booking becomes `disputed` and support works a case (UI-018, UI-019). Neither person sees that on the booking page today, and support's replies don't notify anyone (blueprint 03 §9, 02 J6):
- **The booking page** shows a dispute card for both people: the status, the reason, when it was opened, and a link to the case when the viewer can open it. Once resolved, it shows support's decision and, for this viewer only, the money: the client's refund or what the helper receives.
- **Notifications** gain `support_replied` and `case_resolved`, which link to the case via a new attention target, `{ kind: 'support_case', caseId }`.

Claude wires the data. No new routes.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-026.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §5, §6 (status and money)
- Contracts:
  - **`src/contracts/bookings.ts`:** `BookingDisputeView`, `BookingView.dispute`, `PROBLEM_REASONS`.
  - **`src/contracts/account.ts`:** `NOTIFICATION_TYPES` gains `support_replied` and `case_resolved`.
  - **`src/contracts/home.ts`:** `AttentionTarget` gains `{ kind: 'support_case'; caseId }`.
  - `status.ts` (`CASE_STATUSES`, `CASE_RESOLUTIONS`, `COMPLETED_VIA` incl. `settlement`), `routes.ts` (`app.supportCase`).
- Fixtures:
  - **`src/fixtures/bookings.ts`:** `deskBookingPosterDisputed`, `deskBookingHelperDisputed`, `deskBookingHelperDisputedContacted`, `deskBookingPosterSettled`, `deskBookingHelperSettled`.
  - **`src/fixtures/account.ts`:** `supportNotificationsData`.
- Reuse: the booking page (UI-011), `useCaseStatus` + `StatusBadge`, the problem reason copy from UI-013, money formatting from `@/shared/format`.

**Placeholders Claude added to keep `main` compiling when the contract gained these codes. Please review and replace them:**
- `src/ui/lib/attention-href.ts`: the `support_case` case (likely final).
- `src/ui/screens/account/notification-actions.tsx`: icons for `support_replied` and `case_resolved`.
- `messages/en/ui/notifications.json`: `types.support_replied` and `types.case_resolved`.
- `notifications-screen.test.tsx` and `home-screen.test.tsx`: the new map entries.

## Build

| Item | File | Props | Content |
|---|---|---|---|
| `BookingDisputeCard` | `src/ui/screens/bookings/…` (render on the booking page when `data.dispute` is set, near the top) | `dispute: BookingDisputeView`, `viewerRole` | **Open:** "Problem reported" with the reason, the case status badge, and "Opened Sun, Nov 22". With `canOpenCase`: a **View the case** link to `routes.app.supportCase(caseId)`. Without it, for the helper: "Support is reviewing a problem report about this booking. They'll contact you here if they need anything." **Resolved:** the decision (`resolution.type`, e.g. "Settled at a lower price"), support's summary, and the money line: "$16.50 was refunded to your card" (`refundCents`) or "You receive $40.50 for this booking" (`receivesCents`) |
| Booking page (update) | the UI-011 screen | `BookingView` | A completed booking with `completedVia: 'settlement'` reads "Completed through a settlement" where the completion method shows |
| Notifications (update) | `src/ui/screens/account/…` | `NotificationView` | Final copy and icons for `support_replied` ("Support replied about {title}") and `case_resolved` ("Support resolved your case about {title}"); they link with `attentionHref` |

**Also fix (found while wiring UI-017):** on `NotificationsScreen`, "All notifications marked as read." disappears when the list refreshes. `MarkAllRead`, which holds the feedback, only renders while `unreadCount > 0`. Keep the confirmation visible (for example, render the status region outside that condition).

Copy namespaces: `bookingHub` (or the booking page's namespace) for the card, plus `notifications`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-booking/{poster-disputed,helper-disputed,helper-disputed-contacted}` | the disputed fixtures | Open problem reports |
| `screen-booking/{poster-settled,helper-settled}` | the settled fixtures | The decision and each person's money |
| `screen-notifications/support` | `supportNotificationsData` | The two new notification types |

## Tests
- The case link renders only when `canOpenCase`; the money line shows the viewer's own amount only.
- Copy exists for every `PROBLEM_REASONS`, `CASE_STATUSES` and `CASE_RESOLUTIONS` value used by the card, and for the two new notification types.
- `attentionHref({ kind: 'support_case', caseId })` returns `routes.app.supportCase(caseId)`.
- The mark-all-read confirmation stays visible after the list refreshes to zero unread.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or amounts.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-026.md`. That file tells Claude you're done.

## Out of scope
- Rework visits and settlement offers between the two people (later), change requests (UI-027).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
