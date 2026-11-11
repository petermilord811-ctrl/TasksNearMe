# UI-014 — Messages: the inbox and a conversation

**Status:** ready for Codex · **Branch:** `ui/UI-014-messaging` · **Plan first:** no (unattended) · **Depends on:** UI-013 (merged)

## Goal
The two people on an offer or a booking can talk in one thread (blueprint 02 J2 step 6 and J5):
- `/app/messages`: the inbox.
- `/app/messages/[threadId]`: a conversation.

Before a booking is confirmed, phone numbers and emails arrive already masked. The app does the masking; the UI only renders segments with `MaskedText`. Booking updates ("Jordan is on the way") appear in the thread as status lines. Claude wires both pages inside `AppShell`. The "Message" actions on offers and bookings then lead here.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-014.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (forms), §5, §6, §7
- `docs/blueprint/02-sitemap-and-journeys.md` J2 step 6; `06-verification-trust-compliance.md` (masking before confirmation)
- Contracts:
  - **`src/contracts/messaging.ts`:** `MessageSegment`, `THREAD_KINDS`, `ThreadSubject`, `MessageView`, `ThreadSummary`, `InboxPageData`, `COMPOSER_DISABLED_REASONS`, `ComposerRules`, `ThreadPageData`, `sendMessageInputSchema`, `SendMessageInput`, `ThreadHandlers`.
  - `timeline.ts` (status and system messages carry `event`; word them with the existing `timeline.<type>` copy), `posting.ts` (`PhotoUploadResult`), `people.ts` (`PersonSummary`), `routes.ts` (`messages`, `thread`, `offer`, `findWorkTask`, `booking`), `action-ids.ts` (new `message_poster`).
- Fixtures, the second half of **`src/fixtures/messaging.ts`**:
  - pages: `deskBookingThreadPageData` (after booking, a photo, an on-the-way status line), `deskOfferThreadPageData` (before booking: a masked phone and email, a system line), `closedThreadPageData`, `blockedThreadPageData`;
  - inboxes: `mayaInboxPageData`, `jordanInboxPageData`, `inboxEmptyData`;
  - handlers: `fakeThreadHandlers`.
- Reuse: `MaskedText`, `InitialsAvatar`, `EmptyState`, `PageHeader`, `FormFeedback`, the photo upload pattern, the photo gallery dialog.

## Follow-ups from earlier tickets
1. **`message_poster`** (new offer action): the helper's own offer can now include it in `myOffer.actions` ("Message the client"). In `HelperTaskScreen`, call `onOfferAction({ offerId, action: 'message_poster' })` like the other offer actions. When the result has `redirectTo`, navigate to it with `router.push`. The same applies to any offer action result with `redirectTo`. Please also review the placeholder copy `actions.message_poster`.

2. **`CompletionView.hoursCap`** (your UI-013 contract request, accepted): hourly completions now include the cap. In `CompletionSummary`, show "Hours worked: 3.5 of up to 4" when `hoursCap` is set. Keep the current wording otherwise. `movingCompletionView` has `hoursCap: 4`.

## Build

**Screens** (`src/ui/screens/messages/`, exported from `src/ui/screens/messages/index.ts`). One H1 each.

| Screen | Props | Content |
|---|---|---|
| `InboxScreen` | `data: InboxPageData`, `now` | "Messages". Rows, latest activity first: the other person (initials and name), the task title, the kind ("Offer", "Booking", "Request", "Support"), the last message preview (`MaskedText` for text; status and system lines through their `timeline` copy), the relative time, and an unread count. Each row links to `routes.app.thread(id)`. Empty state: "No messages yet", linking to `routes.app.tasks()` and `routes.app.findWork()` |
| `ThreadScreen` | `data: ThreadPageData`, `handlers: ThreadHandlers`, `now` | **Header:** the other person, the task title, and a link to what it's about (`subject`): `offer_for_client` → `routes.app.offer(taskId, offerId)`; `task_for_helper` → `routes.app.findWorkTask(taskId)`; `booking` → `routes.app.booking(bookingId)`. While `contactMasking`, a notice: "Phone numbers and emails stay hidden until the booking is confirmed". **Messages**, oldest first, grouped by day (market time): mine on the right, theirs on the left; `status` and `system` lines centered and small; attachments as thumbnails that open larger. Open at the latest message. **Composer:** a textarea with a counter (`composer.maxLength`), attach photos (`onUploadPhoto`; up to `maxAttachments`; check `maxPhotoMegabytes` first; remove before sending), and Send. On desktop, Enter sends and Shift+Enter adds a new line. While `!composer.canSend`, show the reason instead (`blocked`: "You can't message each other"; `closed`: "This conversation is closed") |

**Behavior:**
- Sending calls `handlers.onSend({ body, attachmentIds })` (validate with `sendMessageInputSchema`). On `sent`: clear the composer and `router.refresh()`. On errors: keep the draft and show the message: `validation_failed` (empty), `not_allowed` (+ reload), `rate_limited` (with `retryAt`), `unknown`. Lock Send while a request runs.
- New messages: call `router.refresh()` every 15 seconds while the page is visible, and when the window regains focus. Keep the scroll position unless the viewer is already at the bottom.
- Accessibility: the message list is a log region (`role="log"`, polite). Each message has a readable sender and time for screen readers.

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|
| `onSend` | `SendMessageInput` | `sent` | `validation_failed` (`body`, `attachmentIds`), `not_allowed`, `rate_limited`, `unknown` |
| `onUploadPhoto` | `FormData` (`file`) | `{ ok: true, photo }` | `too_large`, `unsupported_type`, `too_many`, `rate_limited`, `unknown` |
| `HelperWorkHandlers.onOfferAction` (follow-up) | `{ offerId, action: 'message_poster' }` | `updated` + `redirectTo` | as before |

Copy namespaces: `inbox` and `thread`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-inbox/{client,helper,empty}` | `mayaInboxPageData`, `jordanInboxPageData`, `inboxEmptyData` | The inbox |
| `screen-thread/booking` | `deskBookingThreadPageData` | After booking: plain text, a photo, an on-the-way line |
| `screen-thread/offer-masked` | `deskOfferThreadPageData` | Before booking: masked phone and email, the notice |
| `screen-thread/closed` | `closedThreadPageData` | Readable; no composer |
| `screen-thread/blocked` | `blockedThreadPageData` | Readable; no composer |
| `screen-thread/sending` | `deskBookingThreadPageData` | Send locked while sending |
| `screen-thread/result-<code>` | `deskBookingThreadPageData` + the result | `validation-failed`, `not-allowed`, `rate-limited`, `unknown` |
| `screen-helper-task/with-message-action` | the UI-009 offer fixture plus a `message_poster` action | The follow-up |

## Tests
- Masked segments render masked (no digits beyond the hint) in both the inbox preview and the thread.
- Sending trims, sends `{ body, attachmentIds }`, clears on `sent`, and keeps the draft on an error.
- Empty messages can't be sent; the counter blocks text over the limit.
- Disabled composers show the reason and no send button.
- The subject link uses the right route for each `subject.kind`.
- `message_poster` navigates to the `redirectTo` it receives.

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). No contact-detail detection in the UI, no routes built by hand, no hard-coded strings.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-014.md`. That file tells Claude you're done.

## Out of scope
- Reporting a message or blocking someone (UI-017), push notifications, and typing indicators.

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
