# UI progress

One row per UI ticket. **Claude** prepares the contracts and the ticket, **Codex** builds the UI, and **Claude** wires it into routes with real data.

Status flow: `planned` → `ready for Codex` → `UI done` (Codex) → `wired` (Claude) → `verified` (e2e green)

Claude updates this file, including the Codex notes column, from each handoff (`docs/ui/handoffs/`).

| Ticket | Scope | Status | Contracts (Claude) | Codex notes | Wiring (Claude) |
|---|---|---|---|---|---|
| [UI-001](tickets/UI-001-design-foundation.md) | Theme, primitives, core components | **wired** | `common`, `status`, `money`, `people`, `location`, `actions`, `action-ids`, `timeline`, `messaging` | 53 previews; 51 tests; `npm run check:ui` passes at 360/1280. Contract requests: `formatMonthYear` (full-date fallback) and `routes.external.googleMapsSearch` (Maps disabled until supplied). See `src/ui/README.md`. | Reviewed 2026-11-10. `AppToaster` mounted in the root layout; `PageSkeleton` is the preview route's Suspense fallback. Both contract requests added (with tests). Removed unused deps `cn`, `next-themes`, `date-fns`. Codex follow-ups moved into UI-002 |
| [UI-002](tickets/UI-002-shells-navigation.md) | Public / app / detail / admin shells, mode switch, navs, plus 2 UI-001 follow-ups | **verified** | `shell`, `routes` (incl. `routes.external`), `formatMonthYear` | Unattended run, 22 min. 15 shell previews (69 total), 126 tests. No new deps, no contract requests. UI-001 follow-ups done | Reviewed 2026-11-11 (check:ui green on `main`, screenshots OK). Wired 2026-11-11: route groups `(public)`, `(app)/app`, `admin/(gated)` render the shells with `getViewer()`; `setMode` and `signOut` server actions; staff two-step gate. e2e `tests/e2e/auth.spec.ts` (8 pass) |
| UI-003 | Public marketing pages: home, market, category, how it works, become a helper, pricing, trust and safety | planned | `marketing`, `tasks` (public card) | | |
| UI-004 | Sign-in and phone verification, waitlist, help center, legal drafts | planned | `auth`, `help` | | |
| UI-005 | Public task board, public task page, helper profile | planned | `tasks` (public), `profiles` | | |
| UI-006 | Posting wizard (with AI-draft placeholder) | planned | `tasks` (forms, zod schemas) | | |
| UI-007 | Poster home, my tasks, task manage, offers and compare, browse/saved helpers | planned | `tasks` (owner), `offers` | | |
| UI-008 | Helper onboarding steps and profile editor | planned | `verification`, `profiles` | | |
| UI-009 | Find work, helper task view, offer form, offers and invites, availability | planned | `offers`, `invites`, `availability` | | |
| UI-010 | Booking confirmation and payment placeholder, direct-invite request | planned | `bookings`, `payments` | | |
| UI-011 | Bookings list and booking page (every state and role) | planned | `bookings` (hub view) | | |
| UI-012 | Booking action sheets: status, change requests, cancel, no-show, can't access, safety | planned | `bookings` (changes, policy preview) | | |
| UI-013 | Completion, approval, report a problem, dispute and settlement | planned | `bookings` (completion, dispute) | | |
| UI-014 | Messaging inbox and conversation | planned | `messaging` (threads) | | |
| UI-015 | Reviews, saved helpers, My clients, rebook proposals | planned | `reviews`, `profiles` | | |
| UI-016 | Receipts and payment methods, earnings and payouts, rewards and redeem | planned | `payments`, `earnings`, `rewards` | | |
| UI-017 | Notifications, account settings, support cases, report and block | planned | `notifications`, `account`, `support` | | |
| UI-018 | Admin: queues, users, moderation, reports | planned | `admin` | | |
| UI-019 | Admin: bookings, cases and resolutions, refunds, payments | planned | `admin` (money) | | |
| UI-020 | Admin: rewards, config, audit, staff | planned | `admin` (config) | | |
| UI-021 | Quality pass: accessibility, responsiveness, copy | planned | — | | |
| UI-022 | *(phase 2)* Recurring visits | planned | `series` | | |

## Notes

<!-- Dated notes, e.g. "2026-11-12 (UI-001): contract request — add `size` to InitialsAvatar fixtures." -->
- 2026-11-10 (UI-001): reviewed and wired.
  - Contract changes: `formatMonthYear` added to `@/shared/format`; `routes.external.googleMapsSearch(address)` added (excludes access notes).
  - Preview harness now hides the Next.js dev button and clears old screenshots each run.
