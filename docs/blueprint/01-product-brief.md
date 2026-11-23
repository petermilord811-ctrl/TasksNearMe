# 01 — Product brief and scope

> Part of the TasksNearMe blueprint. Assumptions are labelled **A#**, decisions **D#**, and items that need provider, legal, or policy confirmation **F#**. All three lists are indexed in [README.md](README.md).

## 1. The product in one line

TasksNearMe lets people book a verified local helper for a specific task, anywhere in the US as we open city by city. The price is agreed up front, payment goes through the platform, and rebooking takes two taps.

**Scope (owner, 2026-11-14): national, cities open in turn.** The site speaks to the whole US. Gainesville, Florida is the first city (A2; owner, 2026-11-17, in place of Austin, Texas, which stays as a later city); others open one at a time, in the order demand shows. In a city we haven't opened, people join that city's waitlist (with its demand counted, by ZIP and city), and helpers can sign up, pass the phone, ID and background checks and earn the welcome gift card now, then choose their neighborhood and add their home address when their city opens. Posting and booking happen only in open cities. Everything market-specific (the ZIP3 prefixes a market covers, boundary, time zone, categories, fees, policies, price guidance) lives in market configuration, so a new city is a data change, not a code change, except one prerequisite: until dates are formatted in each market's own time zone, only markets in Central time can go live (completion plan 8.1).

## 2. Product principles (used to break ties)

1. **Book a task, not a person.** Before anyone commits, every booking has a scope, a time window, and a price.
2. **No surprises on money.** Before confirming, the poster sees the total cost and the helper sees expected earnings. Both see the fees and any approved expenses.
3. **Funded before work starts.** A helper is never asked to start work that isn't paid for yet.
4. **Private by default.** Public pages show only the general area. The exact address goes only to the confirmed helper, and only for as long as they need it.
5. **Keep it on the platform.** Messages, files, changes, and payments stay in the app, so support has the evidence to decide disputes fairly.
6. **Rewards never buy reviews.** No reward depends on leaving a review or on a rating.
7. **One account, two modes.** "I need help" and "I can help" are views of the same account, not separate sign-ups.

## 3. Target users

| Segment | Austin example | Main jobs | What they need from us |
|---|---|---|---|
| **Busy renter or new mover** (poster) | Renter in a Mueller or East Austin apartment, just moved in | Furniture assembly, moving help, cleaning before guests | Offers within hours, a fixed price, a helper they feel safe letting in |
| **Homeowner with a yard** (poster) | Crestview or Circle C homeowner; leaf season and post-storm debris | Yard cleanup, seasonal help | Reliable helpers, and later a recurring schedule |
| **Less tech-confident household** (poster) | Retiree, or an adult child arranging help for a parent | Computer, phone, printer, Wi-Fi help, remote or in person | Patience, verified identity, no scams |
| **Side-income generalist** (helper) | UT student, shift worker, gig worker | Assembly, moving, yard | Nearby work that is already funded, flexible hours, no lead fees |
| **Skilled independent** (helper) | Handy person, IT hobbyist | Assembly, computer help | Fair prices, a professional profile, repeat clients |
| **Independent cleaner or yard worker** (helper) | Runs a small one-person service | Cleaning, yard | Steady repeat clients and payment they can rely on |

**Dual role:** any account can post and help. A helper who is moving can hire moving help with the same login.

**Not served:** companies hiring staff, recruiters, staffing agencies, and anyone posting on behalf of another worker. Helpers must be individuals doing the work themselves (A3).

## 4. Main use cases at launch

| ID | Use case | Primary actor |
|---|---|---|
| UC-1 | Post a task, compare offers, book one | Poster |
| UC-2 | Invite a specific helper directly (from a profile, saved helpers, or a past booking) | Poster |
| UC-3 | Book a slot from a helper's published availability | Poster |
| UC-4 | Browse nearby or remote tasks and send short offers | Helper |
| UC-5 | Propose and accept changes to price, scope, schedule, or hours cap | Both |
| UC-6 | Check in, submit completion evidence, get approved (or auto-approved), get paid | Both |
| UC-7 | Review each other, save the helper, rebook in two taps | Both |
| UC-8 | Get help when something goes wrong: cancellation, no-show, dispute, safety report | Both, plus support |

## 5. Why people come back

**Strongest repeat reason: "Rebook someone you already trust in under a minute."** Once a poster has a good helper, rebooking brings back the known person, a known price range, the booking history, and payment protection. Off-platform alternatives (a text message plus cash or a payment app) can't offer the last two. For helpers, the matching reason is: **funded work, repeat clients, no lead fees.**

Retention mechanics at launch:
- Saved helpers, plus a **Book again** button on every completed booking, receipt, and review screen.
- A **My clients** list for helpers, from which they can send a past client a prefilled rebooking invite.
- A **repeat-booking reward** for helpers (see [05-rewards.md](05-rewards.md)). Its job is to keep repeat pairs on the platform rather than to buy volume.
- Opt-in seasonal reminders, for example "Leaf cleanup again in 3 weeks?" for yard tasks.
- Protection exists only on the platform: support, disputes, and payment protection cover only bookings made and paid on TasksNearMe.

Anti-disintermediation guardrails: phone numbers and emails are masked in messages before a booking is confirmed, rebooking is low-friction, fees stay moderate, and the repeat reward rewards staying.

## 6. Launch categories and booking types

### 6.1 Categories

Scoring criteria: how often people need it, how well it fits fixed pricing, physical and property risk, whether the helper enters the home, licensing exposure in Texas, available supply, and dispute risk.

| Category | Decision | Default pricing | Home entry | Allowed scope | Excluded at launch (reason) |
|---|---|---|---|---|---|
| **Furniture assembly** | **Launch (hero)** | Fixed per item | Yes | Flat-pack furniture, beds, desks, shelves, anti-tip anchoring | Anything electrical, gas, or plumbing (licensed trades); TV mounting (later) |
| **Moving help (labor only)** | **Launch** | Hourly with funded cap, 2-hour minimum | Yes | Loading and unloading, moving furniture within or between rooms, packing | Transport in the helper's vehicle (insurance and regulatory review, **F17**); pianos, safes, hazardous materials |
| **Yard cleanup** | **Launch** | Fixed (hourly optional) | No | Raking and bagging leaves, weeding, ground-level debris pickup, light hand pruning | Pesticide or herbicide application and irrigation repair (licensed in Texas, **F17**); ladders, chainsaws, tree work; haul-away (needs a vehicle) |
| **Light cleaning** | **Launch** | Fixed by home size (hourly optional) | Yes | Standard home cleaning, kitchens and baths, light tidy | Biohazards, mold remediation (licensed in Texas), post-construction cleaning, exterior windows above the ground floor |
| **Computer and phone help** | **Launch, local and remote** | Fixed packages (30 or 60 min remote) or hourly cap | In person: yes | Device setup, Wi-Fi, printers, backups, basic cleanup, how-to help | Unattended remote-access tools, helpers handling passwords or financial accounts, crypto wallets (scam risk) |
| Errands | **Phase 2** | Fixed plus pre-funded expenses | No | Pickups, returns, shopping with receipts | Deferred: vehicle use and insurance, plus heavy use of expense flows (**F17**) |
| TV mounting, pet care, tutoring | Later | — | — | — | Each needs its own trust and safety rules |
| Licensed trades, childcare, elder or personal care, driving people | **Never (out of scope)** | — | — | — | Licensing, safeguarding, and liability |

Remote computer help works like this: the helper shares a video meeting link in the booking chat, the poster shares their screen, and the helper guides them. The poster keeps control of the device and types their own credentials. The chat flags messages that look like passwords or card numbers.

Marketing should lead with three hero categories (**furniture assembly, moving help, yard cleanup**). In Gainesville, oaks drop most of their leaves in late winter and spring, and the University of Florida's move-in and move-out weeks (August, December, May) bring moving help in waves. The product enables all five categories.

### 6.2 Booking types

| Booking type | Launch? | Notes |
|---|---|---|
| Open task → helpers send offers → poster accepts and pays | **Launch (default)** | Poster is charged at acceptance; the booking is confirmed immediately |
| Direct invite to one helper | **Launch** | The poster's card is authorized when the invite is sent. The invite expires in 48 h; the card is captured when the helper accepts and released otherwise. See [04-payments-and-fees.md](04-payments-and-fees.md) |
| Request a slot from a helper's availability post | **Launch** | Creates a prefilled direct invite |
| Quick rebook | **Launch** | Creates a prefilled direct invite to the same helper |
| Fixed price | **Launch (default)** | All categories |
| Hourly with funded spending cap | **Launch** | Moving help by default; optional for cleaning, yard, and computer help |
| Local | **Launch** | All categories |
| Remote | **Launch for computer help only** | The data model allows remote for any category flagged `remote_allowed` |
| Recurring visits (weekly, every 2 weeks, monthly) | **Phase 2** | Cleaning and yard. The data model ships at launch (D9) |
| More than one helper per task (for example 2 movers) | Phase 2 | At launch, a "need 2 helpers" task creates two separate bookings |
| Instant book (no helper confirmation) | Later | Needs reliability data first |

## 7. What to build, add later, or leave out

| Area | Launch (MVP) | Later (phase) | Leave out |
|---|---|---|---|
| **Accounts** | One account with poster and helper modes; email one-time code plus verified phone; 18+ attestation; notification settings; data export and deletion requests | Passkeys (P2); Spanish UI (P2) | Company or team accounts, multiple seats, agencies |
| **Helper profile** | Photo, short bio, services and rates, service area, tools, up to 12 work samples, verification badges, reviews, response time | Video intro; skill tests per category (P3) | Résumés, work history, recruiting pipelines |
| **Verification** | ID verification (provider-hosted) before a helper can send offers; payout onboarding (provider-hosted) before they can be booked; background check before in-home categories (D7) | ID checks for posters, triggered by risk (P2) | Storing ID documents, SSNs, or bank details ourselves |
| **Tasks** | Posting wizard, photos with metadata stripped, local or remote, schedule window, fixed or hourly-with-cap budget, expense allowance, public general area, private exact address | Draft templates per category (P2) | Public exact addresses |
| **AI assist** | Optional **Rewrite with AI** in the task description field that turns a one-line request into a formatted post, a title and questions, with Undo (P1, behind a flag; one field since 2026-11-21) | AI-suggested category and checklist for helpers (P2) | AI-set prices, auto-posting, AI messaging on a user's behalf |
| **Matching** | Task feed for helpers (distance bands, category, date); task alerts for matching helpers; browse helpers; direct invites; availability posts | Automated replacement matching (P2); ranking by reliability (P2) | Auctions, bidding wars, pay-per-lead |
| **Booking** | Confirmation screen with full breakdown; change requests (price, scope, schedule, cap) that both must accept; cancellation with policy preview; no-show reports; check-in | Recurring visits (P2); multi-helper bookings (P2); instant book (P3) | Unscoped "hire me for the week" bookings |
| **Payments** | Card, Apple Pay, Google Pay; charged at confirmation; transfer to the helper after approval; refunds; expense reimbursement against a pre-funded allowance; receipts; earnings view | Tips (P2); instant payouts (P2); scheduled funding for bookings made more than 14 days ahead (P2) | Cash, off-platform payments, stored-value wallets, escrow claims |
| **Messaging** | Offer and booking threads, attachments, real-time delivery, contact masking before confirmation, quick status buttons ("On my way", "Running late", "Arrived"); **direct conversations without a task** (owner, 2026-11-21: from a helper's profile, a community author's card, or by @username (2026-11-22); a daily allowance of new ones by Sparks level or plan (a Newcomer 3, a Neighbor 10), 3 messages until an answer, the recipient's setting, contact details masked until a paid booking together); **@usernames** for every account (2026-11-22: changed once every 30 days) | Masked phone calls (P3); translation (P3) | Unlimited unsolicited messages; contact details before a paid booking |
| **Community (Neighbors)** | Owner, 2026-11-22 (completion plan Part 10): any social post (a general post: words and photos, no title of its own; owner: "it's only for task posts … make it possible") besides the kinds (recommendation, question, tip, thanks), written in a dialog over the page, with up to 4 photos, one reply level with "Replying to…", Helpful and Thanks, a pinned answer, edit with history kept for staff, follow and mute, Unanswered, a reply box on feed cards, helpers told when recommended or thanked and alerted to recommendation requests in their services (3 a day), a weekly email digest (its own topic, on by default), staff announcements per market, a kindness reminder, hidden after reports from 3 established accounts, "See translation" where a model is set up. Real accounts see real rows only there in production | Neighborhood Faves leaderboards; an AI summary of past answers (P2) | Downvotes and public scores; crime and safety posts; for-sale, events and polls; sharing outside the app; search indexing |
| **Notifications** | Email, SMS for critical events only, web push (installable app), in-app inbox | Native push (with native apps) | Marketing SMS at launch |
| **Completion and disputes** | Photos, hours, and receipts; approve; auto-approve after 72 h; report a problem → support case; rework option | Structured evidence checklists per category (P2) | Arbitration by the community |
| **Reviews and repeat** | Two-way, double-blind reviews; saved helpers; Book again; My clients list | Private feedback to support (P2) | Reviews from anyone without a completed booking |
| **Community score (Sparks)** | Owner, 2026-11-21: earned by community posts and replies, Helpful and Thanks from others, completed bookings and reviews written; packs can be bought (Stripe Checkout); levels raise the daily allowance of new direct conversations. Wherever others see someone's Sparks, the bought part shows too | Staff adjustments and refunds of packs from the case tools (P2) | Sparks in search order, matching or helper cards in lists; spending, moving or cashing out Sparks; Sparks from ratings received |
| **Rewards** | Rules engine; **welcome** and **repeat (paid-bookings version)** turned on; **acceptance** and **completion** built but switched off (D8) | Recurring-month repeat reward (with recurring visits); poster credits (P2) | Rewards tied to reviews or ratings; cash-equivalent wallets |
| **Admin and support** | Live chat with support from TasksNearMe Help (2026-11-22: a queue, Join, typing, End), queues, user and booking timelines, moderation, cancellation overrides, refunds with limits, dispute cases, reward review/void/reissue, audit log, market and fee config | Macros and SLAs dashboard (P2); fraud scoring model (P3) | Direct database editing by staff |
| **Platform** | Installable mobile-first web app (PWA), SEO pages per market and category, analytics, error monitoring, feature flags; a national site with city waitlists and helper sign-up anywhere in the US (owner, 2026-11-14) | Native apps (P3); the next cities, in the order demand shows (the first outside Central time needs per-market time zones, plan 8.1) | Native apps at launch |

## 8. Candidate features: prioritization

| Candidate | Value | Cost and risk | Decision | What ships at launch instead |
|---|---|---|---|---|
| **AI-assisted task descriptions** | Clearer scope leads to better offers, fewer price changes, and fewer disputes. Biggest help for first-time posters | About 3–5 dev-days. Model cost is pennies per draft (see [07-architecture.md](07-architecture.md) §8). Risks: invented details and price anchoring, handled by always letting the poster edit and approve, and never letting AI set prices | **Launch as P1 behind a flag.** Ship if M2 is on schedule; otherwise ship in the first post-launch release | Category templates with structured fields (item count, floor, stairs, tools) |
| **In-app calls** | Day-of coordination, especially for moving and late arrivals | Number-masking infrastructure, per-minute costs, recording-consent rules, abuse handling. Provider status needs confirming (**F11**) | **Phase 3** | Chat, one-tap status buttons, and SMS alerts for "On my way" and "Running late". Phone numbers stay private |
| **Recurring bookings** | Highest retention for cleaning and yard; predictable helper income | Scheduling engine, charging each visit separately, failed-payment recovery, pause and skip rules, plus a separate reward variant | **Phase 2 (4–6 weeks after launch).** Data model ships at launch (D9). Behavior is specified in [03-state-machines.md](03-state-machines.md) §7 | One-tap rebook plus an opt-in "remind me in N weeks" |
| **Replacement matching** | Saves the booking when a helper cancels | Auto-invites, race conditions, and holding funds while a replacement accepts | **Phase 2 automated** | On a helper cancellation the poster gets a full refund plus a **Find a replacement** action that reopens the task and notifies previous offerers and similar helpers. Support can help manually |

## 9. Launch success targets (first 90 days, assumptions to revisit)

| Area | Metric | Target |
|---|---|---|
| Liquidity | Tasks with at least one offer within 2 h (7 am–9 pm) | ≥ 70% |
| Liquidity | Posted tasks that become confirmed bookings | ≥ 50% |
| Quality | Confirmed bookings completed | ≥ 90% |
| Quality | Bookings with a dispute case | ≤ 3% |
| Reliability | Helper no-shows or late cancellations | ≤ 2% of bookings |
| Retention | Posters who book again within 60 days | ≥ 25% |
| Economics | Contribution per booking, before rewards | ≥ $6 |
| Trust | Bookable helpers who are ID-verified | 100% |
| Privacy | Address exposure incidents | 0 |
