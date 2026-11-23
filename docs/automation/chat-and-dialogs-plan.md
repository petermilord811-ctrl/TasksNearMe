# Chat, requests and fewer redirects: the plan (2026-11-23)

The owner (2026-11-23), after New message moved into the chat box: "plan all and implement". "All" means:

- the 11 chat and request suggestions from that reply (C1–C11);
- the 12 redirects from the review that are still open (R1, R2, R7, R8, R10, R12–R18; R3–R6, R9 and R11 shipped with batch 1).

Earlier asks still apply: "I want to do it in live chat box itself. I hate to redirect to new pages continually. Review the page redirect logics in this platform and remove if unnecessary. if possible, use dialog."

Base: 11872a0e plus two uncommitted commits that wait for the owner's "commit":
- A: New message in place.
- B: fewer redirects, batch 1.

Both sit in `/home/ubuntu/TasksNearMe-redirects`. Every worktree below starts from that state, staged in its index, so `git diff` in a worktree shows only that worktree's own work.

## Who builds what

| Worktree | Branch | Builder | Items |
|---|---|---|---|
| `/home/ubuntu/TasksNearMe-chat` | feat/chat-requests | tasksnearme-65 (main) | C1–C10 |
| `/home/ubuntu/TasksNearMe-dialogs1` | feat/dialogs-one | helper D1 | R12 notifications sheet, R1 offer dialog, R2 receipt dialog, R13 proposal dialog, R14 invite helpers dialog, R18 find-work dialog |
| `/home/ubuntu/TasksNearMe-dialogs2` | feat/dialogs-two | helper D2 | R7 add a card in the series sheet, R8 phone in place on Neighbors, R15 phone step in place on Post a task, R16 phone and address checks as dialogs, R10 explain instead of bouncing, R17 Neighbors post dialog |
| `/home/ubuntu/TasksNearMe-support` | feat/support-chat | helper S | C11 live support |

The main session folds the helpers' work into the chat worktree with 3-way merges (base: `/home/ubuntu/tnm-base-ab`), gates the whole set, and lands it on the owner's "commit": A, then B, then one commit per area.

## Rules for every builder

**Git and landing**
- Never commit, stash, reset, push or ship.
- Never run `git add` or `git checkout -- <path>` in a worktree: the index holds the A+B base.
- Leave the shared checkout `/home/ubuntu/TasksNearMe` and the other worktrees alone, including `/home/ubuntu/TasksNearMe-plans`, which is tasksnearme-8d's.
- `docs/automation/decisions.md` and `docs/ui/progress.md`: don't edit them. Put your rows in `docs/automation/rows-<worktree>.md` (one decisions row, one progress row per item, in the files' own styles). The main session folds them in.
- Don't run `node scripts/client-messages.mjs` to commit its output. Run it only for your own tests; the main session regenerates the map once at the end.

**Heavy work**
- Anything heavy goes through `node /home/ubuntu/TasksNearMe/scripts/heavy.mjs …`, run from your worktree: typecheck, lint, Vitest, `test:db`, builds, e2e and previews.
- `npm run typecheck` needs the 4096 MB heap it sets. Never run a bare `npx tsc`.
- No dev servers. See pages through the e2e build: `heavy.mjs --e2e-build npx playwright test …` (memory: Reuse the e2e build).
- The box has 7.7 GB of RAM shared with three peers' sessions.

**Migrations**
- Only the chat worktree adds one (C5/C9, `thread_participants`).
- The helpers find a way without one, or say in their report why they can't.

**Product rules**
- Follow CLAUDE.md, AGENTS.md and the memory notes.
- English and Spanish for every key: `npm run i18n:check -- <namespace>`.
- Contracts first, fixtures for every state, and previews in the gallery (`src/ui/previews`).
- Unit tests for UI logic, DB tests for services, and e2e for flows on both `app-mobile` and `app-desktop`.
- Route dialogs follow the 12 that exist: a `@modal/(.)app/…` page plus a `…DialogScreen` on `RouteDialogHeader` and `RouteDialogBody`, with the same sign-in redirect and `TimeZoneProvider`.
- Inside a route dialog, never `router.push` from an action. Use `dialog.finish(result, message, { follow: true })` or close first (redirect review, note A).
- Forms with `useBotCheck` keep `check.widget` and `BotCheckStatusLine` inside the dialog (tasksnearme-d4).

**The report**

When you're done, report:
- the files you changed;
- what each item does now;
- the gates you ran, with pass and fail counts;
- anything left open.

## Chat (C1–C10, main session)

### C1. @usernames in messages are people, not hidden handles
- **Before:** the contact-hiding patterns treat every `@name` as a Venmo or Instagram handle, so `@minh` in a message before a paid booking shows "[hidden]".
- **Contract:** `MessageSegment` gains `{ kind: 'mention'; userId; name; helperHandle? }`.
- **Server:** an `@name` that is a TasksNearMe @username of an account in use becomes a mention. This applies with or without masking, in quotes, and in the inbox preview.
- **Display:** a mention shows the person's shown name ("@Minh T."), never the handle text. A Venmo handle that happens to be someone's username therefore doesn't leak through.
- **Links:** a helper's mention opens their profile. Anyone else's opens New message with them, in the chat window on wide screens.
- **Unchanged:** unknown `@names` stay masked until a paid booking, as before.

### C2. Sample profiles answer once
- Where sample rows are told apart (production, `samplesHiddenInThisBuild()`), the first message to a sample profile in a conversation brings one system line: "{name} is a sample profile that shows how TasksNearMe works, so they won't reply. Post a task to reach real helpers near you." It's a system message (timeline event `sample_profile_notice`), not a fake reply.
- The conversation header shows the "Sample profile" badge, as New message already does.

### C3. Staff accounts have no daily limit on new conversations
- An account with a staff role skips the daily allowance of new direct conversations.
- New message shows "Staff account: no daily limit" instead of the count.
- The first-message rule (3 until an answer) and the recipients' settings still apply.

### C4. Pin, mute, archive, and search in a conversation
- **Migration:** `thread_participants` gains `pinned_at` and `archived_at`. `muted` exists already but nothing reads it yet.
- **Pin:** pinned conversations go first, at most 3.
- **Archive:** archived conversations leave the list and wait under "Archived". A new message from the other person brings one back.
- **Mute:** no "sent you a message" notification by any channel, and the conversation doesn't count in the Messages badge. Its row still shows its own count, with a muted icon.
- **Where:** a ⋯ menu on each row (page and window) and in the conversation's header.
- **Search:** a search in the conversation header looks through the conversation's text as the viewer sees it, so masked details can't be found by searching. It lists matching messages with their time. Choosing one shows the conversation from that message, scrolled to it and highlighted. Served by `GET /api/messages/threads/[id]/search?q=`.

### C5. Message requests
- **What counts as a request:** a direct conversation someone else started where the viewer hasn't written, hasn't accepted, and has no task conversation with them.
- **Where it shows:** "Requests" next to All in Messages (page and window), with a count. Requests don't count in the Messages badge. The bell's "sent you a message" stays, so nobody misses one.
- **Opening one:** a request shows "{name} wants to message you" with Accept, Ignore and Block.
  - Accept: moves it to the list (`accepted_at`).
  - Ignore: archives it, and the sender isn't told.
  - Block: the existing block.
- **Replying** accepts it too.
- **Reading a request** sends no "Seen". That already holds, because presence and Seen wait until both have written.
- **Docs:** update the help article "direct-messages" (en and es) and the pricing page's Direct messages section (tasksnearme-8d's) if they describe what the recipient sees.

### C6. Translate a message
- "Translate" on the other person's messages, in the page and the window.
- It shows the text in the reader's language (English or Spanish) under the bubble, with "Show original".
- Made on request, never stored, using the Neighbors translator (`createTranslator`) on the text as the reader sees it (masked).
- Limited to 60 a day per person. Offered only where translations are (`translationOffered()`).

### C7. Suggested replies
- A "Suggest replies" button in the composer, shown when the other person wrote last.
- It returns up to 3 short replies in the reader's language, from the free models through the load balancer. The prompt holds the masked last 8 messages, the task's title and the reader's first name.
- Choosing one puts it in the composer; nothing is ever sent by itself.
- Limited to 30 an hour. A stand-in gives deterministic replies in development and tests. Production without a model doesn't offer it.

### C8. Two or three conversations side by side (wide screens)
- From 1280 px, a conversation can open in its own docked window to the left of the chat window (Messenger style): "Open beside" in a row's menu, or a middle-click.
- At most 2 docked windows. Each has its own header (minimize, close), messages, composer and live updates.
- The docked windows are kept for the tab (sessionStorage).
- Below 1280 px, a docked conversation opens in the main window instead.

### C9. Task requests as cards in the conversation
- When a client sends a task request (a funded direct invite) to someone they have a direct conversation with, the conversation gets a card: task, when, price, and status (waiting, countered, accepted, declined, expired, canceled).
- **The helper's card:**
  - Accept and Decline in place, the same actions as on the invite page. Accept goes through its payment steps where they're needed.
  - Counter opens the invite page.
- **The client's card:** View task, and Cancel while it's waiting.
- The card updates live from the invite's notices.
- The conversation header's "Send a task request" opens the request dialog over the page.

### C10. Change proposals as cards in the booking's conversation
- A booking change (time, price, scope, hours cap, expenses) shows as a card in the booking's conversation, with its status. Review opens the change dialog that already exists.
- The conversation offers "Propose a change", which opens the existing change dialog.

## Support (C11, helper S)

### C11. Live support
- **Who's helping:** the person from support who joins shows with their first name and profile photo, or initials. This applies in the Help conversation's header and on their messages.
- **Rating:** after a live chat ends, or a case is solved, a one-tap rating (good or bad, with an optional comment). It's stored as a case event, with no migration, and shown to staff on the case page and the live page.
- **Transcript by email:** "Email me this conversation" sends the case's conversation to the member's account email, in their language. Limited to 3 a day per case.
- **Office hours:** live-chat hours shown where a person asks for a live chat (a constant, Gainesville time). Outside them it says "We'll reply here and by email", and the request goes into the queue.

## Redirects (helpers D1 and D2)

Numbers follow the redirect review (decisions.md, 2026-11-23).

### D1
- **R12, notifications as a sheet:**
  - The bell opens the notifications in a route dialog over the page: `@modal/(.)app/notifications`.
  - A row marks itself read, then closes the dialog and follows its link. Conversation links open in the chat window on wide screens.
  - The chat window's link catch must let the dialog close first: skip anchors inside `[data-route-dialog]`, or close the dialog and then open the window.
- **R1, offer detail as a dialog:** the helper's name or "View offer" on the task page, the compare table and the dashboard open the offer over the page. Book continues into the confirm dialog that already exists.
- **R2, receipt as a dialog:** a payment row opens its receipt over the payments list. Print still works.
- **R13, proposal as a dialog:**
  - "View proposal" opens the rebook proposal over the page.
  - Accept pays the hold (with 3-D Secure in place, `setBusy`) and follows to the new booking.
  - Decline and withdraw finish in place.
- **R14, invite saved helpers from the task:** "Invite helpers" on an open task opens a dialog listing saved helpers, each with Request, which opens the existing request dialog over the task.
- **R18, find-work as a dialog:**
  - The public task page's "Make offer" opens the offer form in a dialog.
  - The helper feed's task title opens the task in a wide dialog, if it fits cleanly; otherwise just the offer form.

### D2
- **R7:** "Add a card" in the series' Change-card sheet adds the card right there (`AddCardForm`).
- **R8:** "Verify your phone" on Neighbors (composer, new post, reply) verifies right there, in the account page's phone dialog, and the draft stays.
- **R15:** "Post a task" without a verified phone shows the phone step on `/app/tasks/new` itself, as the invite gate does, instead of the trip through `/app/verify-phone`. The J-C2 journey tests need updating.
- **R16:** the verified-helper reminder's phone and home address checks open as dialogs (new URLs under `/app/helper/checks/[step]`, never intercepting the onboarding wizard's own steps). They finish in place and refresh the reminder. ID, payouts and background checks stay hand-offs.
- **R10:** Neighbors, its new-post page, Plan and Post a task explain why they can't open (e.g. no home market) and what to do, instead of a silent bounce to Home.
- **R17:** a Neighbors post opens over the feed in a route dialog (`@modal/(.)app/community/[postId]`), without the side rail. The feed keeps its scroll and filters. Watch for:
  - the photo viewer, a nested Radix dialog: Escape closes only the viewer, and focus stays in the post dialog;
  - neighbors.spec.ts' carousel and named-helpers tests;
  - the post links in community.spec.ts (tasksnearme-56).

## Landing
1. Owner says "commit": A and B land as built (`land.sh`).
2. The combined chat, support and dialogs work lands in commits by area, after one full gate on the combined tree:
   - typecheck, lint and units;
   - full `test:db`;
   - the e2e specs for every touched screen, on both projects;
   - previews.
3. The tasksnearme-8d plans merge: whoever lands second merges, per their notes. That covers PersonPicker and DirectMessageForm's plan lines, `PeopleSearchData.allowanceFrom`, and the `find-pro` preview.
4. Ship only on the owner's "ship".
