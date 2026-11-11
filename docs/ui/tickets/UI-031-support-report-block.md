# UI-031 — Support, and reporting or blocking someone

**Status:** ready for Codex · **Branch:** `ui/UI-031-support-report-block` · **Plan first:** no (unattended) · **Depends on:** UI-017 (merged)

## Goal
The account menu and the helper navigation link to **Support** (`/app/support`), which doesn't exist yet (blueprint 02 §1.2, 03 §9):
- **Support:** a member's cases, open ones first. Disputes and safety reports open cases automatically. A new request form takes a topic, an optional booking, a description and photos.
- **A case** (`/app/support/[caseId]`): its status and the conversation with support, with a reply box while the case is open.
- **Report or block** the other person from a conversation's header (`ThreadScreen`, UI-014): report with a reason and details; block and unblock.

Claude wires the pages inside `AppShell` and the thread header.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-031.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/03-state-machines.md` §9 (support cases)
- Contracts:
  - **`src/contracts/support.ts`:** `SUPPORT_TOPICS`, `MEMBER_CASE_KINDS`, `SupportCaseRow`, `SupportPageData`, `newSupportRequestInputSchema`, `NewSupportRequestInput`, `CaseEventView`, `SupportCasePageData`, `supportReplyInputSchema`, `SupportReplyInput`, `SupportHandlers`, `SupportCaseHandlers`, `REPORT_REASONS`, `reportInputSchema`, `ReportInput`, `ReportSubject`, `ReportHandlers`.
  - `status.ts` (`CASE_STATUSES`, and `useCaseStatus` already exists in the UI), `posting.ts` (`PhotoUploadResult`), `routes.ts` (`support`, `supportCase`, `booking`).
- Fixtures: **`src/fixtures/support.ts`**: `mayaSupportPageData`, `supportEmptyData`, `disputeCasePageData`, `closedCasePageData`, `jordanReportSubject`, `blockedReportSubject`, `fakeSupportHandlers`, `fakeSupportCaseHandlers`, `fakeReportHandlers`.
- Reuse: `useCaseStatus` + `StatusBadge`, the photo upload pattern, `FormFeedback`, `Dialog`/`AlertDialog`, `EmptyState`, the message log styles from `ThreadScreen`.

## Build

**Screens** (`src/ui/screens/support/`, exported from `src/ui/screens/support/index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `SupportScreen` | `data: SupportPageData`, `handlers: SupportHandlers`, `now` | "Support". **Your cases:** rows with the kind ("Problem report", "Safety report", "Report", "Request"), the subject, the status badge, "Updated 2 hours ago", and an unread mark; each links to `routes.app.supportCase(id)`. **New request:** a form with `newSupportRequestInputSchema`: the topic (radio), an optional booking (select from `bookings`), the description (20 to 2,000 characters), and photos (up to 4). On `submitted`, go to `redirectTo`. Above it, a safety note: "In danger? Call 911" (`tel:911`). Empty: "No cases yet" |
| `SupportCaseScreen` | `data: SupportCasePageData`, `handlers: SupportCaseHandlers`, `now` | The subject (H1), the kind, the status badge, the opening date, a link to the booking when `bookingId` is set (`routes.app.booking`), and the description. **Conversation** (oldest first): messages from you and from support (photos open larger), with status changes as small centered lines ("Waiting for your reply"). **Reply** box while `canReply` is true (`supportReplyInputSchema`); otherwise "This case is closed. Start a new request if you still need help", linking to `routes.app.support()` |

**Components** (`src/ui/components/safety/`):

| Component | Props | Content |
|---|---|---|
| `ReportBlockMenu` | `subject: ReportSubject`, `handlers: ReportHandlers` | A menu button for the conversation header with **Report** and **Block** (or **Unblock**). **Report** opens a dialog with the reason (radio, `REPORT_REASONS`) and details (10 to 1,000 characters); on `submitted`: "Thanks. Support will review this." **Block** asks first: "Blocked people can't message, offer or invite each other" |

**Thread page addition:** `ThreadScreen` takes an optional `safety?: { subject: ReportSubject; handlers: ReportHandlers }` and shows `ReportBlockMenu` in its header when it's set.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onCreate` | `NewSupportRequestInput` | `submitted` + `redirectTo` | `validation_failed`, `rate_limited`, `unknown` |
| `onUploadPhoto` | `FormData` | `{ ok: true, photo }` | `too_large`, `unsupported_type`, `too_many`, `rate_limited`, `unknown` |
| `onReply` | `SupportReplyInput` | `sent` (refresh, clear the box) | `validation_failed`, `not_allowed`, `rate_limited`, `unknown` |
| `onReport` | `ReportInput` | `submitted` | `validation_failed`, `rate_limited`, `unknown` |
| `onBlock` | `{ blocked }` | `updated` (refresh) | `unknown` |

Copy namespaces: `support`, `supportCase`, `safety`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-support/{default,empty}` | `mayaSupportPageData`, `supportEmptyData` | Cases and the new request form |
| `screen-support/{validation-failed,submitting}` | `mayaSupportPageData` + results | Form states |
| `screen-support-case/{open,closed}` | `disputeCasePageData`, `closedCasePageData` | A case |
| `screen-thread/with-safety-menu`, `screen-thread/blocked-by-me` | the UI-014 thread fixtures + `jordanReportSubject` / `blockedReportSubject` | The header menu |
| `component-report-dialog/{default,validation-failed,submitted}` | `jordanReportSubject` | The report dialog |

## Tests
- The new request validates and sends `{ topic, bookingId?, description, photoIds }`, then navigates.
- A closed case shows no reply box.
- Report needs a reason and at least 10 characters; block asks first; unblock doesn't.
- Copy exists for every `SUPPORT_TOPICS`, `MEMBER_CASE_KINDS`, `REPORT_REASONS` and `CASE_STATUSES` value.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-031.md`. That file tells Claude you're done.

## Out of scope
- Reporting tasks and reviews (later), staff tools (UI-018 onward), and dispute proposals (UI-026).

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
