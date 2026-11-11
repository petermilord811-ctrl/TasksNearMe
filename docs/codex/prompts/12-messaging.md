# Prompt 12 — Messaging

**Plan first:** yes · **Depends on:** 09 · **Branch:** `ui/12-messaging`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`ThreadView`, `MessageView`), §5 (messages and masking), §7 (`messages.*`)
- `docs/codex/design-system.md` §4.2 (`MaskedText`), §6 (the contact-masking sentence)
- `docs/blueprint/02-sitemap-and-journeys.md` J2 (pre-booking thread)
- `docs/blueprint/08-data-model-and-access.md` §4 (who can read messages)

## Build
1. **`/app/messages`** (inbox).
   - Each thread row: initials avatar, other party, task title, preview of the last message (masked where it applies), time, unread badge.
   - Filters: All / Offers / Bookings / Support. Search.
   - Empty state.
2. **`/app/messages/[threadId]`** (`DetailPageShell`).
   - **Header:** other party, link to the task or booking, status badge.
   - **Pre-booking threads** carry a banner with the contact-masking sentence.
   - **Message list:**
     - Day separators; your bubbles and theirs.
     - **System and status messages** look different (On my way, Arrived, change proposed, payment).
     - Attachments: image thumbnails with alt text, and file chips.
   - **Composer:**
     - Auto-growing textarea, attach button (small `PhotoPicker`), and send.
     - On desktop, Enter sends and Shift+Enter adds a line. On phones, there's a send button.
     - In pre-booking threads, a **live warning** appears while the text contains a phone number or email: "Phone numbers and emails are hidden until the booking is confirmed — they'll appear as •••." The sent message renders masked.
   - **Message menu:** **Report** (a minimal sheet now; prompt 15 builds the full flow) and **Block** (with confirmation; the thread then shows a blocked state).
   - A "Delivered" indicator (mock) and optimistic sending through the mock action, marked `// TODO(integration): Ably`.
3. **Booking threads** show contact details unmasked once the booking is confirmed (`messages.booking_thread`).
4. **Support case threads** label staff messages "Support".
5. **Unread counts** show on the nav's Messages item.

## Tests
- E2E:
  - `messages.offer_thread_masked` renders masked for both Maya and Jordan.
  - Sending a message appends it.
  - Typing "512-555-0134" shows the warning.
  - The booking thread isn't masked.
  - Sam opening the Maya–Jordan thread gets 404.
  - On desktop, Enter sends.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Real-time delivery (placeholder only) and the full report flow (prompt 15).

## Review (for the human)
Open `messages.offer_thread_masked` as Maya and as Jordan, try typing a phone number, then open `messages.booking_thread`.
