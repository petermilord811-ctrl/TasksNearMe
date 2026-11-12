# UI-033 — Admin: the bookings list, task moderation, and the audit log

**Status:** done, built by Claude on `main` (Codex at its usage limit; decisions.md) · **Plan first:** no · **Depends on:** UI-002 (admin shell), UI-018 (case rows), UI-019 (the staff booking page), UI-020 (people)

## Goal
Three staff pages the admin nav already links to (blueprint 02 admin routes, 08 §4):
- **Bookings** (`routes.admin.bookings({ filter, q })`): filter tabs (Needs attention, Upcoming, Finished, All) with counts, and a search box (`q`: a booking id, a task title, or a person's name or email; a GET form). Rows: the task, category, status, start, the client and the helper, what the client paid, and a chip per flag ("Disputed", "Open case", "Approval overdue", "Funds held over 21 days", "Payment failed"). Each row links to `routes.admin.booking(id)`. A table on wide screens, cards on phones (like the people list).
- **A task** (`routes.admin.task(taskId)`): what staff need to moderate it: title, category, status, description and details, the area (never an address), the window and budget, offers, when it was posted, the poster (name, email, link to `routes.admin.user`), photos, the booking link when there is one, and the cases about it (the case rows from UI-018). When it's hidden: who hid it, when, and why. Moderation (only `actions`): **Hide**, **Restore**, **Close**, **Remove** a photo, **Move to another category** (a select of `categories`). Each opens a confirmation with a required reason (10–1,000 characters; kept in the audit log).
- **Audit log** (`routes.admin.audit(filters)`): filters (actor, action family, target type, target id, from and to dates; a GET form), entries newest first: when, who (staff with their role, a member, or "System"), the action, the target (linked when `href`), the reason, and the details (key and value). **Older entries** loads `nextCursor` (`routes.admin.audit({ ...filters, before: nextCursor })`). Admins and support leads only (Claude guards the route).

Claude wires the routes and data.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-033.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` (tables and cards, dialogs, §5 statuses)
- `docs/blueprint/08-data-model-and-access.md` §4 (who sees and does what)
- Contracts:
  - **`src/contracts/admin-ops.ts`:** `ADMIN_BOOKING_FILTERS`, `ADMIN_BOOKING_FLAGS`, `AdminBookingRow`, `AdminBookingsPageData`; `TASK_MODERATION_ACTIONS`, `AdminTaskPageData`, `taskModerationInputSchema`, `AdminTaskHandlers`; `AdminAuditEntry`, `AdminAuditFilters`, `AdminAuditPageData`.
  - `admin.ts` (`AdminCaseRow`, `StaffSummary`), `status.ts`, `routes.ts` (`admin.bookings`, `admin.booking`, `admin.task`, `admin.user`, `admin.audit`, `admin.case`).
- Fixtures:
  - **`src/fixtures/admin-ops.ts`:**
    - bookings: `adminBookingsAttentionData`, `adminBookingsUpcomingData`, `adminBookingsSearchData`, `adminBookingsEmptyData`;
    - tasks: `adminTaskOpenData`, `adminTaskHiddenData`, `adminTaskBookedData`, `adminTaskReadOnlyData`, `fakeAdminTaskHandlers`;
    - audit: `adminAuditData`, `adminAuditFilteredData`, `adminAuditEmptyData`.
  - `ADMIN_NOW` and the admin shell fixtures (`src/fixtures/admin.ts`, `shell.ts`).
- Reuse: the admin people list (table and cards, GET search), case rows (UI-018), status badges, the confirmation-with-reason dialog from the people page (UI-020).

## Build

| Item | File | Props | Content |
|---|---|---|---|
| `AdminBookingsScreen` | `src/ui/screens/admin/admin-bookings-screen.tsx` (exported from the admin index) | `data: AdminBookingsPageData`, `now` | As in Goal |
| `AdminTaskScreen` | `src/ui/screens/admin/admin-task-screen.tsx` | `data: AdminTaskPageData`, `handlers: AdminTaskHandlers`, `now` | As in Goal. Sends `taskModerationInputSchema`; on `updated`, say so and refresh. The exact address never appears (there is none in the data) |
| `AdminAuditScreen` | `src/ui/screens/admin/admin-audit-screen.tsx` | `data: AdminAuditPageData`, `now` | As in Goal |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success | Error codes |
|---|---|---|---|
| `onModerate` | `TaskModerationInput` | `updated` | `validation_failed` (`fieldErrors.reason`), `not_allowed`, `unknown` |

Copy namespaces: `adminBookings`, `adminTask`, `adminAudit`. Labels for every `ADMIN_BOOKING_FILTERS`, `ADMIN_BOOKING_FLAGS` and `TASK_MODERATION_ACTIONS` value.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-admin-bookings/{attention,upcoming,search,empty}` | the bookings fixtures | Each tab, a search, nothing found |
| `screen-admin-task/{open,hidden,booked,read-only}` | the task fixtures | Each state |
| `screen-admin-task/{hide-dialog,remove-photo-dialog,recategorize-dialog,saved,validation-failed,not-allowed}` | `adminTaskOpenData` + results | Moderating |
| `screen-admin-audit/{default,filtered,empty}` | the audit fixtures | The log |

## Tests
- Only `actions` render; each moderation sends the action with its reason (and `photoId` or `categorySlug`); the reason is required.
- Filters and search are GET forms that use the route builders (no routes by hand).
- Copy exists for every filter, flag and moderation action.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-033.md`.

## Out of scope
- Payments, config and staff roles (UI-034), hiding reviews and profiles, exporting the audit log.

## Claude wiring notes (filled in by Claude after review)
- Routes: `/admin/bookings` (`filter`, `q`), `/admin/tasks/[taskId]`, `/admin/audit` (filters and `before`; admins and support leads, others get not found), `/admin/reports` (redirects to the reports queue). The Audit nav item shows only for admins and support leads.
- Queries and actions: `getAdminBookings` (`src/modules/support/staff-bookings.ts`; flags from SQL), `getAdminTaskPage` / `moderateTask` (`src/modules/tasks/moderation.ts`) with `moderateTaskAction` (refreshes the `tasks`, `task:<slug>` and market tags), `getAdminAuditPage` / `parseAuditQuery` (`src/modules/support/staff-audit.ts`).
- Data: migration 0022 adds `tasks.hidden_at`, `hidden_by_user_id`, `hidden_reason`. Hidden tasks leave the board, the feeds, the recent lists, the landing map and the public page; helpers can't offer (the existing "task closed" reason), invites can't use them; the poster and helpers who already offered still see them.
- Links in: the staff booking page and case page now link "Open the task" (`AdminBookingPageData.booking.taskId`, `AdminCasePageData.taskId`).
- Seed: `tsk_patio` (Chris's patio, open) for the moderation e2e only.
- Tests: integration `staff-ops` (moderation, hidden-task visibility, flags, search, audit filters and cursor); UI `admin-ops-screens`; e2e `admin-ops.spec` (an agent finds Ana's disputed dresser and opens its task; trust and safety hide and restore the patio task; a lead sees both in the audit log).
