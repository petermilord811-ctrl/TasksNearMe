# 02 — Sitemap and user journeys

> Route paths are Next.js App Router paths (see [07-architecture.md](07-architecture.md)). `[market]` is a market slug such as `austin`. Everything is designed for phone-width screens first and works on desktop. States and actions are defined in [03-state-machines.md](03-state-machines.md); money is covered in [04-payments-and-fees.md](04-payments-and-fees.md).

## 1. Sitemap

### 1.1 Public (signed out, indexable unless noted)

```
/                                   Home: post-a-task CTA, categories, how it works, trust, current market
/[market]                           Market landing (e.g. /austin)
/[market]/[category]                SEO category page (e.g. /austin/furniture-assembly): price guidance, recent public tasks, top helpers
/[market]/tasks                     Public task board: general area only, no photos
/tasks/[taskSlug]                   Public task view: title, category, area name, date window, budget, offer count; CTA "Sign in to make an offer"
/helpers/[handle]                   Public helper profile: first name + last initial, photo, services, rates, area (neighborhood level), badges, reviews, work samples
/how-it-works                       For posters
/become-a-helper                    For helpers: earnings, requirements, verification steps, current welcome reward terms
/pricing                            Fees explained with a worked example
/trust-and-safety                   Verification, address privacy, payment protection, reporting
/help, /help/[article]              Help center
/legal/[doc]                        terms, privacy, helper-agreement, cancellation-policy, rewards-terms, community-guidelines, prohibited-tasks
/sign-in                            One flow for sign-in and sign-up (email code, or Continue with Google or Microsoft → name and age for new accounts → phone verification when needed) — noindex
/waitlist                           Outside the cities we're open in: join the waitlist for your city (email, ZIP, optional city); how many already wait near your ZIP (?zip=); the cities coming next by demand; helpers can get verified now — noindex
```

### 1.2 Signed in (one account; a mode switch only changes the default home and navigation)

```
/app                                Home: "Needs your attention" (approvals due, offers to review, invites, unread messages)
/app/tasks                          My posted tasks (open, booked, past)
/app/tasks/new                      Posting wizard: category → describe (AI assist) → details → photos → where → when → budget → review
/app/tasks/[taskId]                 Manage task: offers list, invite helpers, edit, cancel
/app/tasks/[taskId]/offers/[offerId]   Offer detail + pre-booking thread + "Book"
/app/helpers                        Browse and search helpers (category, area, availability)
/app/saved                          Saved helpers → Book again
/app/find-work                      Helper task feed (list/map, distance bands, filters)
/app/offers                         My offers and invites received (helper)
/app/availability                   My availability posts (helper)
/app/bookings                       All bookings as poster or helper (upcoming, needs action, past)
/app/bookings/[bookingId]           Booking hub: terms and breakdown, timeline, address (helper, once confirmed), checklist, actions
/app/bookings/[bookingId]/changes/[changeId]   Review a proposed change
/app/bookings/[bookingId]/complete  Helper completion: photos, hours, receipts
/app/bookings/[bookingId]/problem   Poster: report a problem / dispute
/app/bookings/[bookingId]/review    Leave a review
/app/messages, /app/messages/[threadId]
/app/payments                       Poster: receipts, payment methods
/app/earnings                       Helper: earnings by booking, transfers, payouts, link to provider payout dashboard, tax forms
/app/rewards                        Helper: pending / redeemable / redeemed rewards, terms, redeem
/app/clients                        Helper: My clients → offer to rebook
/app/helper/onboarding/[step]       profile → services → area → ID verification → payout setup → background check (in-home categories)
/app/helper/profile                 Edit helper profile, services, tools, work samples
/app/support, /app/support/[caseId] My support cases; new report
/app/account                        Profile, contact, security, notifications, verification status, privacy (export / delete)
/app/series/[seriesId]              Recurring schedule (phase 2)
```

### 1.3 Admin workspace (staff only; separate layout; staff session requires TOTP 2FA)

```
/admin                              Queues: open disputes, reports, no-shows, flagged rewards, failed transfers/payouts, stuck bookings, aging funds (>21 days)
/admin/users, /admin/users/[userId] Profile, verification statuses (status only, no documents), bookings, money summary, strikes, notes, actions
/admin/tasks/[taskId]               Moderation: hide, recategorize, remove photos, close
/admin/bookings/[bookingId]         Timeline, terms versions, money ledger, messages (access logged), policy-aware actions
/admin/cases, /admin/cases/[caseId] Disputes, no-shows, safety, payment and reward issues; resolution tools
/admin/reports                      User and content reports → cases
/admin/payments                     Charges, refunds, transfers, payouts, chargebacks, reconciliation exceptions
/admin/rewards                      Programs, budgets, grants, risk review queue, void / reissue
/admin/config                       Markets, categories, fee schedules, policies, feature flags (admin role only; versioned). Every staff role reads the markets' status, read-only (plan 8.2)
/admin/audit                        Append-only audit log search and export
/admin/staff                        Staff roles (admin role only)
```

## 2. Journeys

Actors in the examples: **Maya** (poster, Mueller, ZIP 78723) and **Jordan** (helper, East Austin). Both use phones.

### J1 — Post a task (poster)

1. **I need help → Post a task.** Pick a category. Prohibited-task keywords block posting and link to the prohibited-tasks page.
2. **Describe.** Title and one description field with light formatting: a toolbar for headings, bold, italic and lists, a preview of how it will read, and pasted formatting kept (stored as text with light marks and drawn as elements, never as HTML). **Rewrite with AI** sits in the field (owner, 2026-11-21: one field, not a separate helper box): it turns Maya's own words, even "need my desk built, box is in the living room", into a short formatted post (a sentence, then headings with lists), fills the title if she has none or suggests one beside hers, and lists open questions; **Undo** brings her words back. Maya edits everything. Nothing is posted automatically.
3. **Details.** Category-specific fields. For assembly: item type, brand, count, floor, elevator, tools on site. For moving: rooms, heavy items, stairs.
4. **Photos (optional, up to 8).** Uploaded directly to storage. The server re-encodes each image and strips metadata, including GPS, before anyone else can see it. The app reminds Maya to keep house numbers, mail, and faces out of the frame.
5. **Where.** *Local*: address autocomplete. The exact address, unit, and access notes are stored encrypted. A preview shows exactly what helpers will see: "Mueller, Austin — within about 1 mile of here". Any US address can be posted (owner, 2026-11-21: "remove the limit of area totally"): outside the market's service area helpers see its city ("Waco, TX") around the ZIP's center (public Census data), and the screen says helpers there may be few for now. The task stays in Maya's market (its board, prices and clock). *Remote*: no address.
6. **When.** A date plus a time window (Saturday 10 am–1 pm), or "flexible by date". The start must be at least 3 hours away and no more than 14 days out (A7).
7. **Budget.** Fixed price, or an hourly rate plus estimated hours plus a cap. A price under the category's usual minimum is allowed and noted on the screen, for offers and requests too (owner, 2026-11-21: "remove minimum budget price: just notify it to user"); the step has no "Typical in Austin" guidance box. Optional **expense allowance** with a description, for example "up to $20 for wall anchors".
8. **Review and post.** Two columns: *public* and *only your booked helper sees*. A verified phone number is required to post. A payment method is not needed until booking.

Result: the task is `open`. Matching helpers (category, service area, alert settings) get an alert, rate-limited to N per helper per hour. An unbooked task expires at the end of its window.

### J2 — Find work and make an offer (helper)

1. **Gate.** Only **bookable** helpers (ID verified + payout setup complete + category eligibility) can send offers. Others can browse and see "Finish setup to send offers".
2. **Feed.** List or map with filters: category, date, distance band, budget, remote. Cards show the title, area name, distance band ("~2 mi"), date window, budget, offer count, and the poster's trust signals (phone verified, member since, rating as a poster).
3. **Task detail.** Signed-in, bookable helpers see the full description, structured fields, and photos. They never see the address.
4. **Offer.** For fixed price: accept the budget or propose a price. For hourly: a rate and a cap. Also a proposed start within the window, a message (500 characters, contact details masked), and what they'll bring. The offer expires at the window start or after 72 h, whichever is first.
5. **Rules.** One active offer per helper per task. Editing creates a revision and notifies the poster. Offers can be withdrawn. A helper can have at most 25 active offers.
6. **Pre-booking thread.** The poster and helper can message inside the offer. Contact details stay masked until the booking is confirmed.

### J3 — Direct invite, availability slot, rebook (poster-initiated)

1. From a helper profile, saved helpers, an availability post, or a past booking: **Request booking**. Pick the service, the task details (new or an existing open task), the time, and the price (the helper's listed rate is pre-filled).
2. **Funded invite.** Maya confirms the payment method. The card is **authorized, not captured**, for the total. The invite expires in 48 h or 2 h before the start, whichever is sooner.
3. **Jordan** can accept (card captured, booking confirmed), decline (card authorization released), or counter with a new price or time. A counter needs Maya's acceptance and a new authorization if the total goes up.
4. **Availability post.** Jordan publishes "Sat 9 am–1 pm · Yard cleanup · East Austin + 5 mi · $30/h". Requesting that slot creates the same funded invite with the slot pre-filled, and the slot is held while the invite is pending.
5. **Neighborhood day** (owner, 2026-11-24). A helper opens a day on one neighborhood of their service area, and neighbors take its visits: one trip, less travel for the helper, and a lower price when the helper chooses one. From **My availability**, Jordan picks the neighborhood, the date (today to 14 days out), one kind of work, 2 to 8 visits with their times, his price per visit (fixed, pre-filled with his listed price), and optionally a **neighbor price** lower than it. We never discount on his behalf.
   - Each visit is an availability slot (step 4) with the day's price, so every slot rule holds per visit (3 h lead, at most 12 h, no overlap with his other posts, at most 10 open posts in all).
   - The card ("Jordan T.'s neighborhood day · Hyde Park · Sat, Dec 12 · 3 of 6 visits open · Furniture assembly · $50 a visit, usually $65") shows on Neighbors for that place, on his profile (instead of repeating the visits under Open times), and as a line in Find helpers. It names the neighborhood only, never an address.
   - **Taking a visit** is the slot request of step 4 in the request dialog, so each visit becomes its own funded invite and booking, with its own price, payment, and state machine; nothing in money or the booking states changes. Other open visits that day switch the dialog in place.
   - **Who can take one:** the trip goes to the task's place, so the request must be for one of the client's open tasks whose place is in that neighborhood (not the client's home area, which can be blank, stale, or not where the work is). Everyone sees the card.
   - The card reads **open**, **filling up**, **full** (no visit open), **past** (every visit has started), or **canceled**. Jordan can cancel the visits still open or requested (a waiting request is declined and its hold released); booked visits follow the normal cancellation rules.

### J3b — Building and street groups (owner, 2026-11-24)

Small private group chats on **Neighbors**, with the same masking and reporting as other chats. Maya lives in Mueller.
1. Under **Your groups** on Neighbors she taps **Create a group**: a name ("Aldrich St 1900 block") and whether it's for a building or a street. It belongs to her own neighborhood; she's its admin. At most 3 groups created a person, 50 members a group.
2. In the group (a sheet over Neighbors, never another page) she taps **Make an invite**: a link and an 8-character code that work for 7 days. She shares them herself; we never list, suggest or search groups, and nobody is added without accepting.
3. Ben, also in Mueller, opens the link: Neighbors opens **Join a group** with the group's name, kind, area and size, and what members will see of him (first name, last initial, neighborhood; never his address, phone or email). He taps **Join group**. Someone from another neighborhood sees why they can't join; an expired or turned-off code names nothing.
4. The chat is newest at the bottom, the composer under it; phone numbers, emails, links and payment handles are hidden, always (no booking unlocks a group). Each message can be reported (the report form over the page; staff see only that message and can remove it) and deleted by its author. People who blocked one another don't see each other's messages.
5. A new message is a notification **in the app only** (never email, text or push), one unread a group that later messages join; a member can mute the group. The admin removes members and turns invites off; anyone can leave (the admin role passes to the member who joined first; the last one out closes the group).
6. Text only for now: photos in groups wait for their own file access rule.

### J4 — Confirm and pay (poster accepts an offer)

1. **Book Jordan** opens the confirmation screen. It shows the scope summary, schedule, helper, and price breakdown (below), the cancellation policy summary, "Jordan will see your exact address after you book", and the terms checkbox.
2. Pay with card, Apple Pay, or Google Pay. If the bank asks for 3-D Secure, the app shows it inline.
3. **Success**: the booking is `confirmed` and the payment is `funded`. Other offers are declined automatically with a polite notice. The task becomes `assigned`. The booking thread opens, Jordan gets the exact address, both receive a calendar invite, and reminders are scheduled.
4. **Failure**: Maya sees a clear error and can retry or use another method. The booking stays `pending_funding` for 30 minutes, then expires. Jordan's offer stays open.

| Maya sees (poster) | | Jordan sees (helper) | |
|---|---|---|---|
| Task price | $60.00 | Task price | $60.00 |
| Service fee (10%) | $6.00 | Service fee (10%) | −$6.00 |
| **Total charged today** | **$66.00** | **You'll earn** | **$54.00** |
| Approved expenses (if any) | charged at cost | Approved expenses (if any) | reimbursed at cost, no fee |

### J5 — Before and during the task

- **Reminders** go out 24 h and 2 h before the start. Jordan can tap **On my way**, **Running late** (10, 20, or 30 min), and **Arrived** (check-in).
- **Changes.** Either person can propose new price, scope, schedule, hours cap, or expense allowance. The other must accept before the start, or within 24 h for changes made during work. If the total goes up, Maya pays the difference before the change takes effect. If it goes down, the difference is refunded when the change is accepted.
- **Cancel.** The cancel screen always shows a policy preview with the exact refund and fee before anyone confirms.
- **Helper no-show.** If Jordan hasn't checked in or sent a late update 30 minutes after the window start, Maya can report a no-show. Maya gets a full refund and Jordan gets a reliability strike. Jordan can contest within 24 h, which opens a support case.
- **Poster unavailable.** Jordan checks in, waits 20 minutes, and taps **Can't access**. Maya is notified. If Maya doesn't respond within 30 minutes, the late-cancellation fee goes to Jordan. Maya can contest.
- **Team up** (owner, 2026-11-24: "a helper brings a second helper onto a two-person job like moving, with one shared chat with the client"). Before a confirmed booking starts, Jordan (the lead) taps **Team up** on its page and, in a dialog over it, invites one partner by @username (a verified, active helper bookable for that kind of work in the market, not blocked by Jordan or the client) with a price for the partner's part, fixed or hourly, and a note.
  - Sam (the partner) gets the invite as a card in his conversation with Jordan (their direct conversation, made for the team if they had none): **Accept** or **Decline**; until it's booked he can **Step back**, and Jordan can **Cancel invite** until the client answers.
  - Sam's yes reaches the client as a card in her conversation with Jordan: "Jordan wants to bring Sam: $60 for Sam's part". **Confirm** opens the normal confirm dialog over the conversation for Sam's part, in Jordan's payment mode (paid directly: booked at once; held: paid upfront like any booking). **Not now** ends it.
  - Sam's booking is an ordinary booking with its own money, state machine, completion and review (03 "Team jobs"); Sam gets the exact address under the normal rules of his own booking. Each helper sees the other's name and role only, never the other's pay.
  - The client's bookings list shows both parts as one team job ("Team: Jordan (lead) and Sam"). Each booking's conversation carries a team bar that switches in place between the viewer's team conversations: the client's two, or a helper's booking conversation and the lead and partner's team chat.
  - **Ending.** Sam canceling his booking (or the client canceling it) follows the normal rules and leaves Jordan's untouched; Jordan can then invite someone else. When Jordan's booking is canceled, the client chooses on its page: **Keep Sam**, or **Cancel Sam's booking** through its own cancel sheet (policy preview first).

### J6 — Complete and approve

1. Jordan taps **Mark complete** and adds evidence. Fixed price: at least one photo for physical in-home work, or a short summary for remote work. Hourly: hours worked, no more than the cap. Expenses: a receipt photo and amount, no more than the allowance.
2. Maya is notified: **"Approve or report a problem within 72 hours."**
   - **Approve** → `completed`.
   - **Report a problem** → the booking becomes `disputed` and a support case opens. Jordan can respond, offer a rework visit, or propose a partial refund (a price change Maya accepts).
   - **No response** → auto-approved at 72 h, with reminders 24 h and 4 h before.
3. Staff can extend approval windows, for example over a holiday.

### J7 — Payment and payout

- On completion, Jordan's earnings ($54.00) go to Jordan's payout account as one transfer, and approved reimbursements go as a separate transfer. Any unused hours cap or expense allowance is refunded to Maya. Maya gets a receipt by email.
- Jordan's earnings list shows each booking's price, fee, earnings, reimbursements (shown separately, not as income), and status: *Transferred* → *Paid out to bank ••1234*. Rewards appear only on the Rewards page, never mixed with earnings.

### J8 — Review and rebook

- Both are prompted after completion. Reviews are **double-blind**: each becomes visible when both are submitted, or after 14 days. A review has a 1–5 rating, tags, and optional text. Reviews can be reported but are removed only under the published policy. Low ratings are never suppressed (**F12**).
- Maya taps **Save Jordan** and later **Book again**, which opens a pre-filled invite (J3) with the same category, the same address, and the last price as a suggestion.
- From **My clients**, Jordan can send Maya a pre-filled rebooking proposal. It becomes a booking only when Maya accepts and pays.

### J9 — Outside the cities we're open in (owner, 2026-11-14: national, cities open in turn)

- **A visitor in Dallas** posts a task: the address search covers the whole US, and her Dallas address reads *Outside our cities for now*. Since 2026-11-21 she can post it (owner: no area limit): helpers see "Dallas, TX", the panel says helpers there may be few for now, and the task stays on her home market's board, prices and clock. (Before, she couldn't post it and was sent to the Dallas waitlist.)
- **A helper in Dallas** signs up as usual. On the Area step he chooses **Somewhere else in the US** and gives his ZIP and city instead of an Austin neighborhood. He finishes the phone, ID, payouts and (for in-home services) background checks, and earns the welcome gift card like any helper (05). The home address step shows *When your city opens*: we verify addresses only where we're open. The done step says "You're verified. We'll tell you the moment Dallas opens." He isn't bookable and doesn't appear in any market's search.
- **When staff open Dallas** (pre-launch or live, `setMarketStatus`, admins only, with a reason, audited), every helper waiting with a ZIP the Dallas market covers moves to it and gets *TasksNearMe is open in Dallas* (`city_open`), leading to the Area step: he chooses his neighborhood, adds his home address, and can be booked once it's verified.
- Matching a ZIP to a city uses the market's ZIP3 prefixes (`markets.zip_prefixes`, Austin: 786 and 787), never a geocoder's stored result.

## 3. Worked example: the $60 desk assembly

Assumes the default fees (A5): 10% poster fee and 10% helper fee. Jordan is in the welcome-reward cohort and this is Jordan's first booking.

| When (Austin time) | Who | Action | System effects | Money |
|---|---|---|---|---|
| Mon 7:40 pm | Maya | Posts "Assemble a desk (flat-pack, 1 item, 2nd floor, elevator)". Budget $60 fixed, Sat 10 am–1 pm, 1 photo | Task `open`; address encrypted; public point fuzzed within Mueller; 14 matching helpers alerted | — |
| Mon 8:15 pm | Jordan | Offers $60, "Sat 10:30, bringing my drill" | Offer `pending`, expires Sat 10:00 | — |
| Tue 9:02 am | Maya | Compares 3 offers and books Jordan; pays $66.00 with Apple Pay | Booking `confirmed`; payment `funded`; 2 other offers declined; Jordan receives the address; reminders scheduled; welcome reward `pending` ("$50 pending — unlocks after this task is completed and paid") | Charge $66.00 to the platform account |
| Fri 10:30 am | System | 24 h reminder | — | — |
| Sat 10:24 am | Jordan | Taps **Arrived** | Booking `in_progress` | — |
| Sat 11:48 am | Jordan | **Mark complete** with 2 photos | Booking `completion_submitted`; approval due Tue 11:48 am | — |
| Sat 1:05 pm | Maya | **Approve** | Booking `completed`; earnings transfer created; review prompts sent | Transfer $54.00 to Jordan's connected account; platform keeps $12.00 before costs |
| Sat–Tue | Provider | Payout to Jordan's bank on the payout schedule (a new account's first payout can take longer, **F3**) | Earnings status *Paid out* | Payout $54.00 |
| Sat 1:05 pm + 7 days | System | Reward hold ends: no refund, dispute, or chargeback | Welcome reward `redeemable` | — |
| Following Sun | Jordan | Taps **Redeem**, picks a gift card at the provider's page | Reward `issuing` → `delivered` | $50 gift card, paid from the promotions budget |
| Sat–Sun | Both | Leave reviews (5★ and 5★) | Both published once both are submitted | — |
| 3 weeks later | Maya | **Book again** for a bookshelf, $45 | Funded invite → Jordan accepts → captured → `confirmed` | Charge $49.50 |

### Variants on the same booking

| Variant | What happens | Maya pays (net) | Jordan receives | Platform keeps (before costs) |
|---|---|---|---|---|
| Maya doesn't respond after completion | Auto-approved Tue 11:48 am | $66.00 | $54.00 | $12.00 |
| Maya cancels Wed (≥ 24 h before) | Full refund | $0.00 | $0.00 | $0.00 (processing cost is lost, see 04 §6) |
| Maya cancels Sat 8 am (< 24 h) | Late fee = max($10, 20% × $60) = $12, paid entirely to Jordan; everything else refunded | $12.00 | $12.00 | $0.00 |
| Jordan cancels or no-shows | Full refund plus a strike for Jordan; **Find a replacement** offered | $0.00 | $0.00 | $0.00 |
| Dispute: "one drawer misaligned" → Jordan offers a $15 reduction and Maya accepts | Price changes to $45; fees are recalculated on the new price | $49.50 (refund $16.50) | $40.50 | $9.00 |
| Wall-anchor kit bought under a $20 allowance (receipt $8) | $86.00 charged at booking; $8 reimbursed; $12 unused allowance refunded | $74.00 | $54.00 earnings + $8.00 reimbursement | $12.00 |
| Reward impact | The welcome reward is voided in the cancel and no-show rows. In the dispute row it still qualifies because $45 is above the $40 threshold | — | — | — |
