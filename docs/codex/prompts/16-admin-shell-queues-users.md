# Prompt 16 — Admin I: shell, queues, users, moderation, reports

**Plan first:** yes · **Depends on:** 02 · **Branch:** `ui/16-admin-core`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §2 (staff viewers), §4 (`QueueSummary`, `AuditEntry`), §7 (`admin.queues`, `case.report_user`), §13 (`/admin/verify`)
- `docs/codex/design-system.md` §3 (admin layout), §4.2 (`DataTable`, `ReasonGateDialog`)
- `docs/blueprint/02-sitemap-and-journeys.md` §1.3
- `docs/blueprint/08-data-model-and-access.md` §4 (access matrix and staff limits)
- `docs/blueprint/06-verification-trust-compliance.md` §4 (staff see statuses, not secrets)

## Build
1. **`/admin/verify`:** the staff two-step check placeholder (6-digit code; `123456` works in the mock). It's required once per session (cookie) before any admin page, and shows a `DemoBadge`.
2. **Admin layout polish.**
   - Sidebar items appear by role: Config and Staff for `admin` only.
   - A role badge. Switch roles by switching the dev-toolbar viewer: alex, morgan, taylor, casey, riley.
   - **Global search** for users and bookings (by ID or title), with a results page.
3. **`/admin`** (queues dashboard).
   - A `QueueSummary` card per queue (count, oldest item's age, SLA breaches), each linking to its filtered list.
   - "My assigned cases" and recent audit entries.
4. **`/admin/users`.**
   - `DataTable` columns: full name (staff only), poster/helper, status, verification statuses, strikes, joined, last active.
   - Filters and search. Card list on phones.
5. **`/admin/users/[userId]`.**
   - **Summary.** Contact details are partly masked by default. Revealing them goes through `ReasonGateDialog` ("Reason for viewing contact details").
   - **Statuses:** identity, payouts, background check, with dates only. Note: "Documents are held by our providers."
   - Bookings table, money summary (charges and earnings totals), rewards summary.
   - **Strikes:** a lead or above can void a strike, with a reason.
   - **Internal notes:** add a note.
   - **Actions by role:**
     - Warn, restrict, suspend (temporary, with an end date), restore.
     - **Ban** (trust & safety) needs a second reviewer, so it first shows "Pending second review".
     - Every action requires a reason and writes a mock audit entry.
     - Disabled actions say why, using `permissions.ts`.
6. **`/admin/tasks/[taskId]`** (moderation).
   - Task details in public and private sections, with the exact address behind `ReasonGateDialog`.
   - Photos, each removable.
   - Hide or restore, recategorize, close. Each requires a reason and is audited.
7. **`/admin/reports`.**
   - List: target type, reason, reporter, age, status. A detail drawer.
   - Actions: dismiss (with a reason), create a case or attach to an existing one, hide the content.
8. **Audit.** Every admin action appends to the mock audit log. Recent entries show on the dashboard; the full audit page comes in prompt 18.

## Tests
- Unit: `permissions.ts` for every role × action.
- E2E:
  - The verify gate.
  - The sidebar changes by role.
  - Suspending a user with a reason creates an audit entry.
  - Ban requires a second reviewer.
  - The reason gate appears before contact details or the address are revealed.
  - Report → create case.
- axe at both viewports, including table captions and header cells.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Bookings, cases, and payments (prompt 17); rewards, config, audit, and staff (prompt 18).

## Review (for the human)
Open `/admin` as each staff viewer. Open Jordan's user page and try every action as Alex, then as Taylor.
