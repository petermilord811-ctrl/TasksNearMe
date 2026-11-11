# UI-018 — Admin: the queues and working a case

**Status:** ready for Codex · **Branch:** `ui/UI-018-admin-queues-and-cases` · **Plan first:** no (unattended) · **Depends on:** UI-002 (admin shell), UI-031 (support for members)

## Goal
Members can now open cases: problem reports, safety reports, reports about a person, and requests. Staff need the other side (blueprint 02 §1.3, 03 §9; backlog B-052, B-054):
- **Queues** (`/admin`): one card per queue with the open count, response-target breaches, and the oldest case.
- **Cases** (`/admin/cases`): the list, filtered by queue, status and "assigned to me".
- **A case** (`/admin/cases/[caseId]`): the people on it, the booking, the opening description and photos, and the timeline (messages with each person, internal notes, changes). Staff can reply to one person, add a note, assign, move the status, resolve and close. A reported conversation opens only after the staff member gives a reason.

Claude wires the pages inside `AdminShell`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-018.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7 (admin density)
- `docs/blueprint/03-state-machines.md` §9 (support cases); `docs/blueprint/08-data-model-and-access.md` (staff access: messages only after a reason)
- Contracts:
  - **`src/contracts/admin.ts`:** `CASE_PRIORITIES`, `ADMIN_QUEUES`, `StaffSummary`, `QueueSummary`, `AdminHomeData`, `AdminCaseRow`, `ADMIN_CASE_STATUS_FILTERS`, `AdminCaseFilters`, `AdminCasesPageData`, `AdminCaseParty`, `AdminCaseActor`, `AdminCaseEventView`, `AdminCaseBookingSummary`, `ADMIN_CASE_ACTIONS`, `AdminCasePageData`, the input schemas (`staffReplyInputSchema`, `staffNoteInputSchema`, `caseStatusInputSchema`, `caseResolutionInputSchema`, `restrictedAccessInputSchema`), `AdminConversationView`, `RevealConversationResult`, `AdminCaseHandlers`.
  - `status.ts` (`CASE_TYPES`, now with `request`; `CASE_STATUSES`, `CASE_RESOLUTIONS`, `BOOKING_STATUSES`); `routes.ts` (`admin.home`, `admin.cases(filters)`, `admin.case`).
- Fixtures: **`src/fixtures/admin.ts`**: `ADMIN_NOW`, `alexStaffSummary`, `morganStaffSummary`, `adminHomeData`, `adminHomeQuietData`, `adminCasesPageData`, `adminCasesFilteredData`, `adminCasesEmptyData`, `disputeAdminCaseData`, `reportAdminCaseData`, `resolvedAdminCaseData`, `reportedConversation`, `fakeAdminCaseHandlers`.
- Reuse: `AdminShell` (previews render inside it), `useCaseStatus` + `StatusBadge`, `FormFeedback`, `Dialog`/`AlertDialog`, `EmptyState`, the photo viewer, and `@/shared/format` for times and money.

## Build

**Screens** (`src/ui/screens/admin/`, exported from `src/ui/screens/admin/index.ts`). One H1 each. Admin pages are dense: tables on desktop, stacked rows on phones, no horizontal page scroll.

| Screen | Props | Content |
|---|---|---|
| `AdminHomeScreen` | `data: AdminHomeData`, `now` | "Queues". One card per `ADMIN_QUEUES` value: the name, the open count, breaches ("1 past due", danger tone), "Oldest: 1 day ago"; each links to `routes.admin.cases({ queue, status: 'active' })`. A link "My cases (1)" to `routes.admin.cases({ mine: true, status: 'active' })`. All quiet: "Nothing waiting" |
| `AdminCasesScreen` | `data: AdminCasesPageData`, `now` | "Cases". Filters as a GET form or links built with `routes.admin.cases(...)`: queue (all or one), status (`ADMIN_CASE_STATUS_FILTERS`), "Assigned to me". Rows: priority, type, subject, opened by, status badge, the response target ("Due in 2 h", or "Past due 1 h" in danger), assignee or "Unassigned", and a "New reply" mark when `awaitingReply`. Each row links to `routes.admin.case(id)`. Empty: "No cases match these filters" |
| `AdminCaseScreen` | `data: AdminCasePageData`, `handlers: AdminCaseHandlers`, `now` | Header: the subject (H1), type, priority, status badge, the response target, assignee, and the actions in `data.actions` (Assign to me / Unassign; Change status with `nextStatuses`; Resolve; Close; Reopen). **People:** each party with their role ("Client", "Helper", "Reported", "Opened the case"). **Booking** (when set): title, status, start, price (no link yet). **Opening:** reason, description, photos. **Context** (when set): "Open the conversation" asks for a reason (`restrictedAccessInputSchema`) and says the access is logged; on success, shows `AdminConversationView` read-only. **Timeline** (oldest first): messages with the person they're with ("To Jordan T." / "From Jordan T."), notes (visibly marked "Internal note"), status, assignment and resolution lines. **Reply:** pick the person (parties with `canMessage`), write, send (`staffReplyInputSchema`). **Note:** a separate box (`staffNoteInputSchema`). **Resolve:** a dialog with the resolution (radio from `data.resolutions`) and a summary shown to the people on the case (`caseResolutionInputSchema`). When resolved: the resolution and summary |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onAssign` | `{ assign }` | `updated` (refresh) | `not_allowed`, `version_conflict`, `unknown` |
| `onSetStatus` | `CaseStatusInput` | `updated` (refresh) | `validation_failed`, `not_allowed`, `version_conflict`, `unknown` |
| `onReply` | `StaffReplyInput` | `sent` (refresh, clear the box) | `validation_failed`, `not_allowed`, `rate_limited`, `unknown` |
| `onAddNote` | `StaffNoteInput` | `saved` (refresh, clear the box) | `validation_failed`, `not_allowed`, `unknown` |
| `onResolve` | `CaseResolutionInput` | `saved` (refresh) | `validation_failed`, `not_allowed`, `version_conflict`, `unknown` |
| `onClose`, `onReopen` | none | `updated` (refresh) | `not_allowed`, `version_conflict`, `unknown` |
| `onRevealConversation` | `RestrictedAccessInput` | `{ ok: true, conversation }` | `validation_failed`, `not_allowed`, `unknown` |

Copy namespaces: `adminHome`, `adminCases`, `adminCase` (and `status` for any new case labels).

**Also (your UI-031 contract request, accepted):** `SupportCaseRow` (and so the case page's `case`) now has `viewerRole?: 'poster' | 'helper'`, set when the case is about a booking. Use it on `SupportScreen` and `SupportCaseScreen` so `awaiting_poster` / `awaiting_helper` read "Waiting on you" for that person, and keep the neutral labels when it's missing.

**Also (member case page):** support can now write to the other person on a booking case. That person sees the case with `case.description` empty and no opening message. Hide the description block when it's empty.

**Also fix (found by Claude's gate on a busy machine):** `src/ui/screens/helper/helper-forms.test.tsx`, "validates profile lengths and languages, focuses the first error…", checks focus synchronously right after submitting (`expect(screen.getByLabelText('Headline')).toHaveFocus()`). It failed once under load and passes alone. Make it wait for focus the way the UI-013 focus tests do, and check the other form tests for the same pattern.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-admin-home/{default,quiet}` | `adminHomeData`, `adminHomeQuietData` | The queues |
| `screen-admin-cases/{default,filtered,empty}` | `adminCasesPageData`, `adminCasesFilteredData`, `adminCasesEmptyData` | The list and filters |
| `screen-admin-case/{dispute,report,resolved}` | `disputeAdminCaseData`, `reportAdminCaseData`, `resolvedAdminCaseData` | A case being worked |
| `screen-admin-case/{conversation-revealed,reply-validation-failed,resolve-dialog}` | `reportAdminCaseData` + `reportedConversation`; `disputeAdminCaseData` | The reason gate, form states |

All previews use `now = ADMIN_NOW` and render inside `AdminShell` with Alex as the viewer (`alexStaff` from `src/fixtures/shell.ts`).

## Tests
- The case list's filter links come from `routes.admin.cases` and keep the other filters.
- Only the actions in `data.actions` render; `nextStatuses` and `resolutions` drive the choices.
- Reply needs a person and a body; the note box sends `{ body }`; resolve needs a resolution and a summary of at least 10 characters.
- The conversation stays hidden until a reason of at least 10 characters is sent; the dialog says access is logged.
- Copy exists for every `ADMIN_QUEUES`, `CASE_TYPES`, `CASE_PRIORITIES`, `CASE_RESOLUTIONS` and `ADMIN_CASE_STATUS_FILTERS` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-018.md`. That file tells Claude you're done.

## Out of scope
- Money resolutions and refunds (UI-019), users, moderation and the audit page (later tickets), the staff search page, and the booking page for staff.

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
