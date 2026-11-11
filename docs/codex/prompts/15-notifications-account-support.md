# Prompt 15 — Notifications, account, support

**Plan first:** yes · **Depends on:** 12 · **Branch:** `ui/15-account-support`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`NotificationView`, `CaseView`), §7 (`case.*`), §13 (`/app/notifications`)
- `docs/codex/design-system.md` §4.2, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` §1.2 (account, support)
- `docs/blueprint/06-verification-trust-compliance.md` §2–§3
- `docs/blueprint/07-architecture.md` §2 (web push on iPhone needs the Home Screen app)
- `docs/blueprint/08-data-model-and-access.md` §5 (retention, for the delete-account wording)

## Build
1. **Notifications.**
   - The bell opens a popover on desktop and goes to **`/app/notifications`** on phones.
   - List with type icons and unread styling; mark one or all as read; each item links to its target; empty state.
   - Fixture types:
     - offer received; invite received, countered, or expired
     - booking confirmed; reminder; on my way; change proposed
     - completion submitted (approve now); approved; payout sent
     - reward ready to redeem; new message; case update
2. **Push opt-in card** (after the first booking, and in Account).
   - **Android and desktop:** **Turn on notifications** (placeholder permission flow, `DemoBadge`).
   - **iPhone Safari, not installed:** "To get notifications on iPhone, add TasksNearMe to your Home Screen: tap Share, then Add to Home Screen."
   - Detect the platform in a client component, and add a dev-toolbar toggle to preview the iPhone variant.
3. **`/app/account`** sections:
   - **Profile:** first name, last name (private), initials avatar.
   - **Contact:** email; phone with a verified badge; changing the phone uses the mock code flow.
   - **Security:** active sessions (fixture) and **Sign out other devices**.
   - **Notification preferences:** a matrix of event × channel (email, push, SMS).
     - SMS is only for critical events (booking changes, day-of updates).
     - Locked rows explain why.
   - **Verification:** ID, payouts, background check, with statuses and links, plus "We keep only the result, never your documents."
   - **Shortcuts** to payments and payouts.
   - **Privacy:**
     - **Download my data** shows a "request received" state.
     - **Delete account** explains what is deleted and what must be kept for legal and tax reasons (financial records for 7 years). The person types DELETE to confirm, then sees a pending state.
   - **Agreements:** the versions accepted.
   - **Blocked people:** unblock.
   - **Default mode.**
4. **Support.**
   - **`/app/support`:** my cases, with status chips and "We usually reply within 4 business hours".
   - **`/app/support/[caseId]`:**
     - Participant-visible events, messages with support, attachments, status, and the resolution summary.
     - **Appeal**, available for 7 days after a case is resolved.
   - **Report flow**, reached from the report buttons on profiles, tasks, messages, and reviews, and from **Contact support**: a reason picker per target type, details, and evidence photos → a case is created.
   - **Block flow:** confirmation that explains you won't be able to message, offer to, or invite each other.

## Tests
- E2E:
  - Notifications: mark as read, and follow a link.
  - The iPhone hint variant.
  - The preference matrix, with critical rows locked.
  - Delete account requires typing DELETE.
  - Report a message → case → case detail.
  - Block, then unblock.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Real push, email, or SMS delivery.

## Review (for the human)
As Maya, use the bell, `/app/account` (try delete account), and report a message. Then open `case.no_show_contested` as Jordan.
