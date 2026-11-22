# Messages as a chat window, with TasksNearMe Help and live support chat (2026-11-22)

The owner, on Messages being one of the five tabs: "improve it as Reddit similar chat (right bottom fixed chat icon)",
then "it should integrate smoothly with AI agent chat (AI support and if need, they need contact live agent)".
Built by Claude (UI-066; Codex wasn't running). This note is the design; decisions.md has the rows.

## What people see

**Wide screens (1024 px and up)**
- A round chat button fixed at the bottom right of every signed-in page, with the unread count (messages, plus an
  unread reply from support in Help). It rises above a bar pinned to the bottom of the page (a booking's actions).
- It opens a **chat window** docked in that corner, over the page; the page stays usable (not modal; Tab moves on
  past it; Esc minimizes). From 1280 px two panes, the conversations beside the open one; below that one pane with
  Back. At the top: Open full page, Minimize (a bar in the corner: who it's with, the unread count) and Close.
- The window keeps what it shows for the tab (sessionStorage): it stays open from page to page and after a reload.
- **Resizable** (owner, 2026-11-22: "Chat Dialog is not resizable"): drag its top edge, its left edge or the top-left
  corner (it's docked bottom right, so it grows up and to the left); the corner is a button the keyboard moves too
  (arrows grow or shrink it 32 px, Home resets) and a double-click resets. At least 360 × 380, never past the screen
  (it shrinks back inside a smaller one). The size stays for this browser (localStorage `tnm.chat.size`). The two panes
  follow the window's own width (a container query at 42 rem), not the screen's.
- **New message** at the top: `/app/messages/new`, where people find anyone by @username (below).
- A plain click on a link to a conversation (`/app/messages/<id>`, any language) or to Help, anywhere in the app (a
  booking's Message link, a "sent you a message" notification), opens it in the window instead of leaving the page.
  Ctrl or ⌘ click still opens the page in a new tab. Starting a new conversation and "Load earlier" keep their pages
  (in the window, earlier messages load in place).
- Messages' own pages (`/app/messages`, a conversation, Help) close the window and hide the button.

**Phones (under 1024 px)**
- The same button floats just above the tab dock and opens the Messages page: the conversation pages already handle
  the keyboard and the composer pinned at the bottom, which an overlay would have to redo (iOS Safari's keyboard and
  fixed overlays don't mix). That's also how Reddit's mobile site does chat.
- Hidden on the `(flow)` pages (booking, task, offer, posting, a conversation: their own bar owns the bottom) and while
  the keyboard is up. Pages get room under the last row so the button never covers it.

**Navigation**: four tabs on the rail and the dock (a client's Home · Neighbors · Tasks · Bookings; a helper's Home ·
Find work · Neighbors · Bookings). The button is Messages' one place on screen. The pages stay for phones, emails,
texts and "Open full page".

## TasksNearMe Help

Pinned at the top of every conversation list (the window, the Messages page, the list beside a conversation) and
linked from the top of Support.

- **The assistant** (an AI, and it says so) answers from the help center in the person's language: their question
  goes through a small keyword search over the articles (`src/modules/assist/help-retrieval.ts`: titles count most,
  rare words more than common ones), and the best three go into the prompt with the chat so far. Each answer shows the
  articles it used. It never promises refunds, credits or exceptions, never asks for passwords, codes or card numbers,
  and stays on TasksNearMe. Free models through the balancer (Gemini, Kimi, Groq), people's words masked first
  (`asPromptText`: phones, emails, links, street addresses). Popular questions to start, by mode.
- **It hands off**: each answer says whether a person should take over: `suggest` (it needs staff: a refund or charge
  on their booking, a dispute, account access, a failed payment, a report, anything the articles don't answer), or
  `urgent` (someone may be in danger: "If anyone is in danger, call 911 now", then a person). "Talk to a person" is
  also always one tap away. Asking in words ("I want to contact a live agent", "talk to a real person", "quiero hablar
  con una persona") skips the AI: the answer is `live` and the chat connects them at once.
- **Talk to a person is a live chat** (owner, 2026-11-22: "should be implemented lively as other platforms ... let users
  wait until support is attending to chatting, and I will support chatting (admins)"). One tap, no form: it opens an
  ordinary request (the assistant's topic, Safety when it flagged danger; their last question as the request) with the
  chat attached (support sees a note that it came from the assistant, the person's questions as their messages, the
  assistant's answers marked "Assistant (AI)"), and puts it in the **live queue**. The conversation then says where
  they are: "Connecting you to a person from support. You're number 2 in line." while someone from support has a
  staff page open, or "No one from support is online right now. Leave your message here: we'll reply in this chat and
  let you know." It looks again every 10 seconds while waiting, and at once on every live notice.
- **Someone joins**: "Alex from support joined the chat." The header says who it's with ("Alex · Support"); both sides
  see the other typing ("Alex is typing…"), and messages arrive as they're sent. When support ends the chat, "The
  live chat ended." and the case goes on as messages ("Chat live with support" asks for another). A case resolved while
  live ends it too. A reply from the case page to someone waiting joins the chat, so nobody is left "in line" after an
  answer.
- **Then the conversation is the case**: the request, support's replies as they come, and a box that writes to
  support. "Ask the assistant something else" keeps the case a tap away. A case that finished in the last week is
  noted at the top of the assistant.

## Support's live chat console (`/admin/live`)

For the roles that work cases (support agents and leads, trust and safety, admins; others read it). The staff menu's
**Live chat** shows how many wait. The console lists who's **waiting** (oldest first: their name, @username, topic,
how long, the last line, a dot when they wrote last), **your chats**, and **other agents'**. A chat opens beside the
lists with the member's whole conversation, the assistant's part included. **Join chat** takes it (it becomes theirs
and the case is assigned to them if nobody had it; a second agent can't take it), then a box to write (Enter sends;
the member sees "typing…"), and **End chat**. A lead can end anyone's; anyone who answers can end one nobody joined.
Open case goes to the full case page for everything else (notes, resolution, money). The page reads again on every
live notice for support (a staff channel in the staff member's own stream), and every 10 seconds if that stream is
down.

## @usernames

Owner, 2026-11-22: "we need account id as other platforms @pm11 ... can direct chat through that id also (but limited
if karma is low)". Every account has one (`usernames` table): migration 0077 gave everyone of the day one from their
first name (accents folded, letters and digits, `maya`, `maya_2`…), a new account gets one the first time a signed-in
page loads. 3–20 lowercase letters, numbers or `_`, starting with a letter; unique without regard to case; words that
pass for the company or its staff are reserved. People change it on the account page once every 30 days. It shows in
the avatar menu (with their Sparks), in a conversation's header (theirs, with their Sparks), on a community author's
card, under a helper's name on their profile, and on the staff console. **New message** (the window, the Messages
page) finds anyone by it: their profile and the first message come next, under the same rules as other direct
conversations, with the daily allowance shown: **3 new conversations a day for a Newcomer, 10 for a Neighbor**, 25, 40
and 60 for the higher levels (at least 40 with Plus or Pro). A deleted account's username is free again.

**Privacy and integrity.** Nothing is stored for people who only ask the assistant: the chat lives in the tab
(sessionStorage). Each answer comes back signed by the server (HMAC over the account, the chat, the turn, the question
and the whole answer, valid a day), so only genuine turns go back as context or reach support: an edited copy ("the
assistant promised me $500") is dropped and counted in support's note. The market's AI switch (`ai_drafting`, the one
switch for every AI feature) turns the assistant off; "Talk to a person" keeps working. Limits: 20 questions in 10
minutes and 120 a day per person; a hand-off shares the 5 an hour of other requests.

## How it's built

| Piece | Where |
|---|---|
| Contracts | `src/contracts/assistant.ts` (turns, ask and hand-off schemas, `HelpChatData`, `HelpSummary`), the chat window's in `src/contracts/messaging.ts` (`ChatView`, `ChatLoad`, `ChatThreadHandlers`, `ChatInboxData`) |
| Reads (routes, not Server Actions: a page's Server Actions run one at a time, and loading would wait behind sends and typing) | `GET /api/messages/inbox`, `/api/messages/threads/[id]` (marks it read, like its page), `/api/messages/help` (`?read=1` while on screen) |
| Asking | `POST /api/assistant/ask` (JSON, same origin; an answer can take seconds) |
| Actions | `sendFromWindowAction`, `reactFromWindowAction` (no page refresh), `handOffToSupportAction`, `replyToHelpCaseAction`, `requestLiveChatAction`, `typingInHelpCaseAction` |
| Live chat | `src/modules/support/live-chat.ts` (the queue, joining, ending, staff replies, typing, the console's data), `live-chat-actions.ts`; `support_cases.live_*` (migration 0077); `/admin/live` (`AdminLiveScreen`); the staff channel `staff:support` in `src/platform/realtime/hub.ts` |
| Usernames | `src/modules/accounts/usernames.ts`, `usernames` table (0077), `saveUsernameAction`, `FindPersonScreen` on `/app/messages/new` (`?u=`) |
| The assistant | `src/integrations/ai/support-assistant.ts` (prompt, answer schema, tidy, the stand-in), `src/modules/assist/support-chat.ts`, `assistant-turns.ts` |
| Support | `openCaseFromAssistant`, `helpCaseView`, `helpUnreadCount`, `helpRowFacts` in `src/modules/support/service.ts`; the assistant marked in staff's timeline (`AdminCaseActor` `assistant`) and the member's (`CaseEventView.from` `assistant`) |
| The window | `src/app/[locale]/(app)/app/_chat/chat-window-controller.tsx` (state, loading, live notices, the link catch), `use-help-chat.ts` (the tab's assistant chat); UI in `src/ui/components/messaging/` (`ChatLauncher`, `ChatWindow`, `HelpChat`, `HelpRow`), loaded on first open |
| Pages | `/app/messages/help` (`HelpChatScreen`), Help pinned on `/app/messages` and beside a conversation |
| Copy | `chat` (en, es); `supportCase.sender.assistant`, `adminCase.details.assistant*`, `support.assistant*` |

Live updates use the existing stream: the window reads again on `message`, `read` and support's `update` notices,
and every page still refreshes on them, so the counts in the shell come from the server (the 2026-11-20 rule).

## Later

Starting a new conversation inside the window; buttons that create a conversation and jump to it ("Message helper" on
an offer) opening the window; drafts kept per conversation; a preview bubble over the button when a message arrives;
the button on public pages for signed-in people; instant (optimistic) sending; live updates for staff on the case page;
a sound or desktop notification for staff when someone joins the queue; canned replies in the live console; @mentions.
