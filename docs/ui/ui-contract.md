# UI contract: shapes, people, money, actions, scenarios

This document explains the data every screen works with. **The code is authoritative**: types, action ids, and route builders live in `src/contracts/`, and canonical sample data lives in `src/fixtures/`. If this document and the code disagree, the code wins (and Claude updates this document). The product source of truth behind both is `docs/blueprint/` (states: 03, money: 04, rewards: 05, access rules: 08).

**Who uses what:**
- **Codex (UI)** builds components and screens that receive these shapes as props (§2–§6, §10–§12), with previews built from `src/fixtures`.
- **Claude (app)** builds the queries and server actions that produce these shapes, applying the visibility rules (§5). Claude also builds the scenarios, transitions, and dev toolbar (§7–§9), the app-side demo mode used before the backend exists. Codex doesn't implement §7–§9.

---

## 1. Rules

1. Pages (Claude) read data only through `src/modules/<module>/queries.ts`. Those functions take the current `Viewer` and return **role-aware projections**, applying the visibility rules in §5 so pages can't leak data. UI components (Codex) receive those projections as props and never fetch.
2. Money is **integer cents** (`Cents`). Timestamps are ISO-8601 UTC strings, displayed in the time zone of the market they belong to (`markets.time_zone`; completion plan 8.1).
3. Canonical values in §3 are fixed. Tests assert them.
4. All fixture people and places are fictional. The only street name is "Example Lane".

## 2. Mock viewers (selected in the dev toolbar)

| Viewer id | Display name | Role | Facts used by screens |
|---|---|---|---|
| `public` | — | Signed out | — |
| `maya` | Maya R. | Poster (helper mode not set up) | Mueller (78723). Member since Sep 2026. Phone verified. 1 earlier completed booking (yard cleanup with Sam, Oct 2026). Rating as a client 5.0 (1). Saved helpers: Sam |
| `jordan` | Jordan T. | Helper (can also post) | East Austin. Joined Nov 2026; **founding helper #63 of 100**. Bookable: ID verified Nov 2026, payouts active, background check clear Nov 2026. Services: furniture assembly (fixed, from $45), moving help ($35/h, 2 h minimum), yard cleanup ($30/h). Tools: drill, hex keys, level, stud finder. **The desk booking is Jordan's first** |
| `sam` | Sam K. | Helper | Hyde Park. 4.9★ (112 reviews), 140 completed, usually responds in ~20 min. Services: assembly from $50, moving $38/h, yard $32/h, cleaning from $90. **Also the "other helper" in privacy checks** |
| `lee` | Lee M. | Helper | Windsor Park. 4.6★ (9). Assembly from $40; computer help $40 (60-min remote session) |
| `priya` | Priya S. | Helper, onboarding incomplete | Not bookable; used by the onboarding scenarios |
| `chris` | Chris D. | Poster | Cherrywood; moving-help booking with Jordan |
| `ruth` | Ruth A. | Poster | Allandale; remote computer help with Lee |
| `alex` | Alex P. | Staff: `support_agent` | Refund limit $100 |
| `morgan` | Morgan L. | Staff: `support_lead` | Refund limit $500 |
| `taylor` | Taylor B. | Staff: `trust_safety` | — |
| `casey` | Casey W. | Staff: `finance` | Dual approval above $500 |
| `riley` | Riley N. | Staff: `admin` | Config and staff roles |

Background-only fixtures: Ben (Crestview, open yard task), Ana (Hyde Park, open cleaning task), and Dana and Devon (a self-dealing pair flagged in reward review).

## 3. Canonical money values (from `docs/blueprint/04-payments-and-fees.md` §3, §6)

Fees: poster service fee = max(10% of price, $3.00); helper service fee = 10% of price; no fees on expenses. Late-cancellation fee = max($10, 20% of price), capped at the price, paid entirely to the helper.

| Case | Values |
|---|---|
| **Desk, fixed $60** | price 6000 · poster fee 600 · **poster total 6600** · helper fee 600 · **helper earnings 5400** · platform revenue 1200 |
| Small task $25 | price 2500 · poster fee 300 (minimum) · total 2800 · helper fee 250 · earnings 2250 |
| Bookshelf rebook $45 | price 4500 · fee 450 · total 4950 (authorized at invite) · earnings 4050 |
| Bookshelf counter $50 | price 5000 · fee 500 · total 5500 (re-authorized) · earnings 4500 |
| Desk + chair change (+$20) | new price 8000 · fee 800 · new total 8800 · **difference to pay 2200** · new earnings 7200 |
| **Moving, $35/h, 4 h cap** | funded 14000 + fee 1400 = **15400** · worked 3.5 h → price 12250 · fee 1225 · final 13475 · **refund 1925** · helper fee 1225 · **earnings 11025** |
| Moving cap +1 h | price +3500 · fee +350 · **pay 3850 more** · new cap 5 h |
| Desk + $20 expense allowance | charged 8600 · receipt 800 approved → **reimbursement 800** (separate from earnings) · refund 1200 · poster net 7400 |
| Late cancellation (desk) | **helper gets 1200** · poster refund 5400 |
| Early cancellation (desk) | poster refund 6600 · helper 0 |
| **Dispute settlement at $45** | **poster refund 1650** · helper earnings 4050 · platform 900 |
| Remote computer help $40 | price 4000 · fee 400 · total 4400 · earnings 3600 |
| Rewards | welcome **5000** · repeat **1000** · acceptance 5% of 6000 = 300 (cap 500) · completion 10% of 6000 = 600 (cap 1000) |

`src/modules/payments/domain/fees.ts` must reproduce every row. Its unit tests use this table.

## 4. Types (sketch)

> Implemented in `src/contracts/*.ts`; **the code is authoritative**. Differences already made in code:
> - `PriceBreakdown` adds `posterChargedCents` (amount charged up front when it differs from the final total) and `platformRevenueCents` is always present.
> - Message text arrives as `MessageSegment[]` (`src/contracts/messaging.ts`).
> - Action ids live in `src/contracts/action-ids.ts`.
>
> Types for later screens are added to the code as their UI tickets are prepared.

```ts
type Cents = number;            // integer
type ISODateTime = string;      // UTC; display in its market's time zone
type CategorySlug = 'furniture-assembly' | 'moving-help' | 'yard-cleanup' | 'light-cleaning' | 'computer-help';
type StaffRole = 'support_agent' | 'support_lead' | 'trust_safety' | 'finance' | 'admin';

interface Viewer {
  id: string | null;                          // null = public
  kind: 'public' | 'user' | 'staff';
  mode: 'poster' | 'helper';                  // signed-in users only
  displayName?: string;
  staffRoles?: StaffRole[];
  phoneVerified?: boolean;
  helperBookable?: boolean;
}

// ---- Location privacy: two different types on purpose ----
interface PublicLocation {
  kind: 'local'; marketSlug: 'austin'; marketName: string; areaName: string;   // "Mueller"
  publicPoint: { lat: number; lng: number }; radiusMeters: number;             // fuzzed point, ~1 mile circle
  distanceBand?: 'under-1-mi' | 'about-1-mi' | 'about-2-mi' | 'about-5-mi' | 'over-5-mi';
}
interface RemoteLocation { kind: 'remote' }
interface ExactAddress { line1: string; line2?: string; city: string; state: string; zip: string; accessNotes?: string }

// ---- People ----
interface PersonSummary { id: string; displayName: string; initials: string; memberSince: ISODateTime; phoneVerified: boolean }
interface VerificationBadges { idVerifiedAt?: ISODateTime; backgroundCheckedAt?: ISODateTime; phoneVerified: boolean }
interface ServiceSummary { categorySlug: CategorySlug; pricingType: 'fixed' | 'hourly'; fromPriceCents?: Cents; hourlyRateCents?: Cents; minHours?: number }
interface HelperSummary extends PersonSummary {
  handle: string; headline: string; areaName: string; badges: VerificationBadges;
  rating?: { average: number; count: number }; completedCount: number; responseTimeMinutes?: number;
  services: ServiceSummary[]; foundingHelper?: boolean;
}
interface ClientSummary extends PersonSummary { ratingAsClient?: { average: number; count: number } }

// ---- Pricing ----
type PricingInput =
  | { type: 'fixed'; priceCents: Cents }
  | { type: 'hourly'; rateCents: Cents; estimatedHours: number; hoursCap: number };
interface PriceBreakdown {
  pricingType: 'fixed' | 'hourly';
  taskPriceCents: Cents;                     // fixed price, or rate × hours
  hourly?: { rateCents: Cents; hours: number; basis: 'cap' | 'approved' };
  posterFeeCents: Cents; helperFeeCents: Cents;
  expenseAllowanceCents: Cents;              // pre-funded; 0 if none
  approvedExpensesCents?: Cents;
  posterTotalCents: Cents;                   // charged (or to be charged)
  posterRefundCents?: Cents;                 // when the final amount is below the funded amount
  helperEarningsCents: Cents;                // excludes reimbursements
  helperReimbursementCents?: Cents;
  platformRevenueCents?: Cents;              // admin variant only
}
interface Schedule { windowStart: ISODateTime; windowEnd: ISODateTime; flexible: boolean }

// ---- Tasks, offers, invites ----
interface TaskPublicView {
  id: string; slug: string; title: string; categorySlug: CategorySlug; excerpt: string;  // contact details scrubbed
  location: PublicLocation | RemoteLocation; schedule: Schedule; budget: PricingInput;
  offerCount: number; status: TaskStatus; postedAt: ISODateTime;
  poster: Pick<ClientSummary, 'displayName' | 'initials' | 'memberSince' | 'phoneVerified' | 'ratingAsClient'>;
}
interface TaskHelperView extends TaskPublicView {        // signed-in bookable helpers
  description: string; details: CategoryDetails; photos: Photo[]; expenseAllowanceCents: Cents;
  myOffer?: OfferView; canOffer: boolean;
  offerBlockedReason?: 'not_bookable' | 'needs_background_check' | 'outside_area' | 'already_offered' | 'task_closed';
}
interface TaskOwnerView extends TaskHelperView {         // the poster
  exactAddress?: ExactAddress; offers: OfferView[]; invites: InviteView[]; bookingId?: string;
}
interface OfferView {
  id: string; taskId: string; helper: HelperSummary; status: OfferStatus; pricing: PricingInput;
  proposedStart: ISODateTime; message: string; messageMasked: boolean; brings: string[];
  expiresAt: ISODateTime; revision: number; threadId: string;
  breakdownForPoster: PriceBreakdown; breakdownForHelper: PriceBreakdown;
}
interface InviteView {
  id: string; taskId: string; poster: ClientSummary; helper: HelperSummary; status: InviteStatus;
  source: 'profile' | 'saved' | 'availability' | 'rebook' | 'client_proposal';
  terms: { pricing: PricingInput; schedule: Schedule; scopeText: string };
  counterTerms?: { pricing: PricingInput; schedule?: Schedule; message?: string };
  authorizedAmountCents: Cents; expiresAt: ISODateTime;
  breakdownForPoster: PriceBreakdown; breakdownForHelper: PriceBreakdown;
  acceptanceReward?: { amountCents: Cents; status: RewardStatus };   // only when flag reward.acceptance is on
}
interface AvailabilityPostView {
  id: string; helper: HelperSummary; categorySlugs: CategorySlug[]; areaName: string; radiusMiles: number;
  startsAt: ISODateTime; endsAt: ISODateTime; pricing: PricingInput; status: 'active' | 'held' | 'booked' | 'expired' | 'canceled';
}

// ---- Bookings ----
interface BookingView {
  id: string; taskId: string; title: string; categorySlug: CategorySlug;
  status: BookingStatus; cancelReason?: CancelReason; completedVia?: CompletedVia;
  viewerRole: 'poster' | 'helper' | 'staff';
  poster: ClientSummary; helper: HelperSummary;
  schedule: { start: ISODateTime; end: ISODateTime };
  location: PublicLocation | RemoteLocation;
  exactAddress?: ExactAddress;                       // present ONLY when §5 allows
  addressVisibility: 'visible' | 'after_confirmation' | 'hidden_after_completion' | 'not_applicable';
  terms: BookingTermsView; termsHistory: BookingTermsView[];
  openChange?: ChangeRequestView;
  checkIn?: { onMyWayAt?: ISODateTime; lateByMinutes?: 10 | 20 | 30; arrivedAt?: ISODateTime; cantAccessAt?: ISODateTime };
  completion?: CompletionView; dispute?: DisputeView;
  deadlines: { approvalDueAt?: ISODateTime; noShowReportableAt?: ISODateTime; posterResponseDueAt?: ISODateTime;
               addressHiddenAt?: ISODateTime; reviewsPublishAt?: ISODateTime; pendingFundingExpiresAt?: ISODateTime };
  timeline: TimelineEvent[];
  money: { poster?: { charges: PaymentView[]; refunds: RefundView[]; netCents: Cents };
           helper?: { earnings: EarningsRow[] } };
  rewardChips?: { program: RewardProgramCode; amountCents: Cents; status: RewardStatus }[];   // helper only
  reviews: { mine?: ReviewView; theirs?: ReviewView };
  threadId: string; caseId?: string;
}
interface BookingTermsView { version: number; breakdown: PriceBreakdown; scopeText: string; schedule: { start: ISODateTime; end: ISODateTime };
                             acceptedByPosterAt?: ISODateTime; acceptedByHelperAt?: ISODateTime }
interface ChangeRequestView { id: string; type: ChangeType; proposedBy: 'poster' | 'helper'; status: ChangeStatus;
                              before: BookingTermsView; after: BookingTermsView; posterDeltaCents: Cents; expiresAt: ISODateTime; note?: string }
interface CompletionView { submittedAt: ISODateTime; note?: string; photos: Photo[]; hoursWorked?: number; expenses: ExpenseItem[]; approvalDueAt: ISODateTime }
interface ExpenseItem { id: string; description: string; amountCents: Cents; receipt: Photo; status: 'submitted' | 'approved' | 'rejected' }
interface DisputeView { caseId: string; reason: string; openedAt: ISODateTime;
                        proposals: { kind: 'rework' | 'settlement'; by: 'helper' | 'poster'; priceCents?: Cents; reworkAt?: ISODateTime; status: 'open' | 'accepted' | 'declined' }[];
                        resolution?: { type: CaseResolution; summary: string } }
interface TimelineEvent { id: string; at: ISODateTime; actor: 'poster' | 'helper' | 'support' | 'system'; type: string; label: string }

// ---- Money, rewards, reviews, messages, notifications, cases ----
interface PaymentView { id: string; purpose: 'booking_funding' | 'invite_authorization' | 'change_funding'; amountCents: Cents; status: PaymentStatus;
                        method: { brand: 'visa' | 'mastercard' | 'amex' | 'discover' | 'apple_pay' | 'google_pay'; last4: string }; createdAt: ISODateTime }
interface RefundView { id: string; amountCents: Cents; reason: 'cancellation' | 'unused_cap' | 'unused_allowance' | 'change_decrease' | 'dispute_settlement' | 'goodwill'; status: 'pending' | 'succeeded' | 'failed'; createdAt: ISODateTime }
interface EarningsRow { bookingId: string; bookingTitle: string; kind: 'earnings' | 'reimbursement' | 'cancellation_compensation';
                        amountCents: Cents; status: EarningsStatus; transferredAt?: ISODateTime;
                        payout?: { id: string; arrivalDate: string; bankLast4: string; status: PayoutStatus } }
interface RewardGrantView { id: string; program: RewardProgramCode; amountCents: Cents; status: RewardStatus; bookingId?: string;
                            relationship?: { clientDisplayName: string; paidBookings: number; needed: 3 };
                            holdUntil?: ISODateTime; redeemableAt?: ISODateTime; expiresAt?: ISODateTime; voidReason?: string; deliveryLink?: string }
interface ReviewView { id: string; bookingId: string; direction: 'client_to_helper' | 'helper_to_client'; rating: 1 | 2 | 3 | 4 | 5;
                       tags: string[]; body?: string; authorDisplayName: string; status: 'submitted' | 'published' | 'hidden'; publishedAt?: ISODateTime }
interface ThreadView { id: string; kind: 'offer' | 'invite' | 'booking' | 'case'; title: string; otherParty: PersonSummary;
                       lastMessage: MessageView; unreadCount: number; contactMasking: boolean }
interface MessageView { id: string; threadId: string; sender: 'me' | 'them' | 'system'; kind: 'text' | 'status' | 'system' | 'attachment';
                        body: string; masked: boolean; attachments?: Photo[]; createdAt: ISODateTime }
interface NotificationView { id: string; type: string; title: string; body: string; href: string; createdAt: ISODateTime; readAt?: ISODateTime }
interface CaseView { id: string; type: CaseType; status: CaseStatus; priority: 'low' | 'normal' | 'high' | 'urgent'; bookingId?: string;
                     openedBy: PersonSummary; subject?: PersonSummary; slaDueAt: ISODateTime; events: CaseEvent[]; resolution?: { type: CaseResolution; summary: string } }
interface CaseEvent { id: string; at: ISODateTime; actor: string; kind: 'note' | 'message' | 'status' | 'money_action' | 'evidence'; visibility: 'internal' | 'participants'; body: string }
interface Photo { id: string; alt: string; src: string; width: number; height: number }   // local placeholder images only

// ---- Admin ----
interface QueueSummary { key: 'disputes' | 'reports' | 'no_shows' | 'reward_reviews' | 'failed_transfers' | 'failed_payouts' | 'stuck_bookings' | 'aging_funds' | 'reconciliation';
                         label: string; count: number; oldestAt?: ISODateTime; slaBreaches: number }
interface LedgerJournal { id: string; kind: string; occurredAt: ISODateTime; entries: { account: string; debitCents: Cents; creditCents: Cents }[] }
interface AuditEntry { id: string; at: ISODateTime; actor: string; role: StaffRole | 'system'; action: string; target: string; reason?: string }
interface RewardProgramView { code: RewardProgramCode; status: 'active' | 'off' | 'ended'; version: number; budgetCents: Cents;
                              reservedCents: Cents; spentCents: Cents; cohort?: { claimed: number; limit: number }; rulesSummary: string[] }
interface MarketPolicyView { version: number; status: 'draft' | 'published' | 'retired'; effectiveFrom: ISODateTime;
  fees: { posterBps: number; posterMinCents: Cents; helperBps: number };
  cancellation: { freeUntilHours: number; lateFeeBps: number; lateFeeMinCents: Cents };
  timers: { autoApproveHours: number; inviteTtlHours: number; pendingFundingMinutes: number; noShowMinutes: number;
            addressHideAfterHours: number; maxLeadDays: number; minLeadHours: number } }
```

**Enums** (values match `docs/blueprint/03-state-machines.md`):

| Enum | Values |
|---|---|
| `TaskStatus` | draft, open, assigned, completed, canceled, expired |
| `OfferStatus` | pending, stale, accepted, declined, withdrawn, expired |
| `InviteStatus` | authorizing, sent, countered, accepted, declined, canceled, expired, auth_failed |
| `BookingStatus` | pending_funding, confirmed, in_progress, completion_submitted, disputed, completed, canceled |
| `CancelReason` | funding_failed, poster_early, poster_late, helper, helper_no_show, poster_no_show, refunded_in_dispute, admin |
| `CompletedVia` | poster, auto, support, settlement |
| `ChangeType` / `ChangeStatus` | price, scope, schedule, hours_cap, expense_allowance, settlement / proposed, accepted_pending_funding, applied, declined, withdrawn, expired |
| `PaymentStatus` | requires_confirmation, processing, authorized, succeeded, failed, canceled, partially_refunded, refunded, chargeback_open, chargeback_won, chargeback_lost |
| `EarningsStatus` | not_due, on_hold, scheduled, transferred, paid_out, reversed, partially_reversed, failed |
| `PayoutStatus` | pending, in_transit, paid, failed, canceled |
| `RewardStatus` / `RewardProgramCode` | pending, qualified, in_review, redeemable, issuing, delivered, failed, voided, expired / welcome, acceptance, repeat, completion |
| `CaseType` | dispute, no_show, cancellation_review, report_user, report_content, safety, payment_issue, reward_issue, account |
| `CaseStatus` / `CaseResolution` | open, awaiting_poster, awaiting_helper, awaiting_support, escalated, resolved, closed / no_action, release_full, settle, refund_full, rework, goodwill_refund, account_action, reward_action |
| `IdentityStatus` | not_started, processing, requires_input, verified, canceled |
| `BackgroundCheckStatus` | not_required, not_started, invited, pending, clear, consider, suspended, canceled, expired |
| `PayoutAccountStatus` | not_started, pending, requirements_due, active, restricted |

## 5. Visibility rules the query layer must apply

| Data | Who gets it |
|---|---|
| `ExactAddress` | The poster (own task, any status). The booked helper only while the booking is `confirmed`, `in_progress`, `completion_submitted`, or `disputed`, and until **48 h after `completed`**. Staff only after a reason dialog (admin screens). **Nobody else**, ever |
| Task photos, full description, structured details | The poster, bookable signed-in helpers, booking participants, staff |
| Offers on a task | The poster (all); each helper (own offer); everyone else gets the count only |
| Booking (`BookingView`) | Its poster, its helper, and staff. Anyone else gets **404** (Sam opening the desk booking gets 404) |
| Messages | Thread participants; staff only after a reason dialog |
| Poster payment method | The poster and finance staff. Never the helper |
| Earnings and rewards | That helper; staff (support read; finance act) |
| Last names, emails, phones | Never on public screens. Contact details in messages are masked before a booking is confirmed |

## 6. Actions (returned by domain functions; screens render them)

`getBookingActions(booking, viewer, now)` (Claude, domain code) returns `ActionDescriptor[]` (`src/contracts/actions.ts`): `{ id, kind: 'primary' | 'secondary' | 'destructive', enabled, disabledReason?, confirm? }`. The authoritative id list is `src/contracts/action-ids.ts`; there, `respond_change` is split into `accept_change` / `decline_change`, the offer "message" action is `message_helper`, and `add_to_calendar`, `contest_no_show`, `call_it_off`, and `contact_support` are added.

| Action id | Who | Available when | Effect |
|---|---|---|---|
| `pay` | Poster | `pending_funding` | Payment placeholder → `confirmed` or a failure state |
| `message` | Both | Every state except `pending_funding` | Opens the booking thread |
| `view_address` | Helper | Per §5 | Shows `ExactAddressPanel` |
| `on_my_way`, `running_late` | Helper | `confirmed` from 2 h before start; `running_late` also in `in_progress` | Posts a status message |
| `arrived` | Helper | `confirmed`, from 30 min before start | → `in_progress` |
| `propose_change` | Both | `confirmed`, `in_progress`, and no open change | Change sheet |
| `respond_change` (accept / decline) | Counterparty | Open change `proposed` | Accept → `applied`, or `accepted_pending_funding` when the total rises |
| `pay_change_difference` | Poster | Change `accepted_pending_funding` | → `applied` |
| `withdraw_change` | Proposer | Change `proposed` | → `withdrawn` |
| `cancel` | Both | `confirmed` (policy preview first) | → `canceled` with reason by role and timing |
| `report_no_show` | Poster | `confirmed`, now ≥ start + 30 min, no check-in or late update. Before that: disabled with "Available at 11:00 am" | → `canceled (helper_no_show)` |
| `cant_access` | Helper | `in_progress`, ≥ 20 min after arrival | Poster gets 30 min → `canceled (poster_no_show)` |
| `im_here` | Poster | After a can't-access report, before the deadline | Back to `in_progress` |
| `submit_completion` | Helper | `in_progress` (or `confirmed` for remote tasks) | → `completion_submitted` |
| `add_evidence` | Helper | `completion_submitted` | Adds photos or notes |
| `approve` | Poster | `completion_submitted` | → `completed` |
| `report_problem` | Poster | `completion_submitted`, before `approvalDueAt` | → `disputed` + case |
| `offer_rework`, `offer_settlement` | Helper | `disputed` | Adds a proposal |
| `accept_settlement`, `decline_settlement` | Poster | `disputed` with an open settlement | Accept → `completed (settlement)` |
| `review` | Both | `completed`, not yet reviewed by the viewer | Review form |
| `save_helper` | Poster | `completed` | Toggles saved |
| `book_again` | Poster | `completed`, or `canceled` by the helper | Request page pre-filled |
| `offer_rebook` | Helper | `completed` | Client proposal form |
| `find_replacement` | Poster | `canceled` with reason `helper` or `helper_no_show`, the task's window still ahead, not yet reopened | Reopens the task (earlier offers stay with the canceled booking; earlier offerers are notified) and goes to it |
| `contest_no_show` | The person reported | `canceled` with `helper_no_show` (helper) or `poster_no_show` (poster), within 24 h, once | Opens a `no_show` support case and goes to it |
| `report_damage` | Poster | `completed`, within 14 days | New support case |
| `safety_report` | Both | `confirmed`, `in_progress` | Safety sheet (911 first) |

Other action sets, all in their module's `domain/`:
- **Offers:** poster `book_offer`, `decline_offer`, `message`; helper `revise_offer`, `withdraw_offer`, `reconfirm_offer` (when stale).
- **Invites:** helper `accept_invite`, `decline_invite`, `counter_invite`; poster `cancel_invite`, `accept_counter`, `decline_counter`.
- **Rewards:** helper `redeem` (redeemable), `open_gift_card` (delivered); staff `approve_review`, `reject_review`, `void`, `reissue`, `reinstate` (lead only).
- **Staff on bookings:** `staff_cancel_override`, `staff_extend_timer`, `staff_approve_on_behalf`, `staff_refund` (role limits), `staff_hold_transfer`, `staff_release_transfer`, `staff_reverse_transfer` (finance), `staff_reveal_address`, `staff_view_messages` (both behind a reason dialog).

## 7. Scenario catalog (dev toolbar)

A scenario fixes the data and the "now" time (Central). Defaults: `/app` as Maya → `desk.open.offers`; as Jordan → `desk.confirmed`; `/admin` → `admin.queues`.

**Desk ($60, Maya ↔ Jordan; window Sat, Nov 21, 2026, 10:00 am–1:00 pm, agreed start 10:30 am)**

| Scenario id | Now | What it shows |
|---|---|---|
| `desk.draft` | Mon Nov 16, 7:35 pm | Posting wizard at the budget step |
| `desk.open.no_offers` | Mon 7:41 pm | Task just posted |
| `desk.open.offers` | Tue Nov 17, 8:55 am | Offers: **Jordan $60** ("Sat 10:30, bringing my drill"), Sam $70, Lee $55 |
| `desk.open.offers_stale` | Tue 9:00 am | Maya changed the window, so all offers are stale |
| `desk.pending_funding` | Tue 9:01 am | Paying; expires 9:31 am |
| `desk.payment_declined` | Tue 9:01 am | Last attempt declined (Visa •••• 1881) |
| `desk.payment_3ds` | Tue 9:01 am | Bank verification needed |
| `desk.confirmed` | Thu Nov 19, 6:00 pm | Booked; Jordan can see the address |
| `desk.confirmed.change_schedule_proposed` | Thu 6:10 pm | Jordan proposes an 11:30 am start |
| `desk.confirmed.change_price_pending_funding` | Thu 6:30 pm | Maya added a chair (+$20); Jordan accepted; Maya must pay **$22.00** |
| `desk.confirmed.day_of` | Sat Nov 21, 10:05 am | Jordan tapped *On my way* at 9:58 am |
| `desk.no_show_window` | Sat 11:05 am | No check-in or late update; Maya can report a no-show |
| `desk.in_progress` | Sat 10:40 am | Arrived 10:24 am |
| `desk.cant_access` | Sat 10:50 am | Jordan reported *Can't access* at 10:46; Maya has until 11:16 am |
| `desk.completion_submitted` | Sat 12:10 pm | 2 photos; **approval due Tue, Nov 24, 11:48 am** |
| `desk.disputed` | Sat 2:00 pm | "One drawer is misaligned"; case open |
| `desk.disputed.settlement_offered` | Sat 3:00 pm | Jordan offers a $45 final price |
| `desk.completed` | Sat 1:10 pm | Approved 1:05 pm; earnings transferred; review prompts |
| `desk.completed.auto` | Tue Nov 24, 11:50 am | Auto-approved |
| `desk.completed.settled` | Sat 3:20 pm | Final $45; refund $16.50; earnings $40.50 |
| `desk.completed.reviewed` | Mon Nov 23, 9:00 am | Both reviews published; welcome reward unlocking Sat Nov 28, 1:05 pm |
| `desk.completed.address_hidden` | Mon Nov 23, 2:00 pm | More than 48 h after completion: the helper no longer sees the address |
| `desk.canceled.poster_early` | Wed Nov 18 | Full refund |
| `desk.canceled.poster_late` | Sat 8:00 am | $12 to Jordan; refund $54 |
| `desk.canceled.helper` | Fri Nov 20, 5:00 pm | Jordan canceled inside 24 h (strike); *Find a replacement* |
| `desk.canceled.helper_no_show` | Sat 11:10 am | Refund; Jordan can contest |
| `desk.canceled.poster_no_show` | Sat 11:20 am | $12 to Jordan |
| `desk.canceled.dispute_refund` | Mon Nov 23 | Support refunded in full |
| `desk.expenses.completion_submitted` | Sat 12:10 pm | $20 allowance; $8 wall-anchor receipt |
| `desk.expenses.completed` | Sat 1:10 pm | Reimbursement $8; refund $12 |

**Other bookings and flows**

| Scenario id | What it shows |
|---|---|
| `moving.confirmed` | Chris ↔ Jordan, Sat Dec 5, $35/h, 4 h cap, funded $154 |
| `moving.cap_increase_requested` | Jordan asks for +1 h (Chris pays $38.50 more) |
| `moving.completion_submitted` / `moving.completed` | 3.5 h worked; refund $19.25; earnings $110.25 |
| `computer.remote.confirmed` / `computer.remote.completion_submitted` | Ruth ↔ Lee, remote $40; meeting link in chat; no address; completion note instead of photos |
| `invite.sent` | Maya → Jordan, bookshelf $45, **$49.50 authorized**, expires Thu Dec 10, 10:00 am |
| `invite.countered` | Jordan counters $50 (Maya would authorize $55.00) |
| `invite.declined` / `invite.expired` / `invite.canceled` | Authorization released |
| `bookshelf.confirmed` / `bookshelf.confirmed_at_50` | Confirmed rebook (Sat Dec 12) at $45 / at $50 |
| `availability.active` / `availability.held` | Jordan: Sat Dec 12, 9 am–1 pm, yard cleanup, East Austin + 5 mi, $30/h |
| `onboarding.start`, `onboarding.id_ready`, `onboarding.id_processing`, `onboarding.id_requires_input`, `onboarding.id_verified`, `onboarding.payout_requirements_due`, `onboarding.payout_active`, `onboarding.background_invited`, `onboarding.background_consider`, `onboarding.bookable` | Priya's onboarding at each step and outcome |
| `rewards.welcome_pending`, `rewards.welcome_qualified`, `rewards.welcome_in_review`, `rewards.welcome_redeemable`, `rewards.welcome_issuing`, `rewards.welcome_delivered`, `rewards.welcome_voided`, `rewards.repeat_progress` (2 of 3 with Maya), `rewards.repeat_pending`, `rewards.expired`, `rewards.failed` | Jordan's rewards page in each state |
| `earnings.jordan_first` | Desk transferred; first payout expected Mon Nov 30 ("first payout can take about 7 days") |
| `earnings.sam_history` | Paid-out rows, one on hold (dispute), one payout failed → *Action needed* |
| `messages.offer_thread_masked` | Pre-booking thread; Jordan wrote "Text me at 512-555-0134"; displayed masked |
| `messages.booking_thread` | Booking thread with status messages and photos |
| `admin.queues` | Disputes 2, reports 3, no-shows 1, reward reviews 2, failed payouts 1, aging funds 1, reconciliation 1 |
| `case.dispute.desk` | The desk dispute from support's side |
| `case.no_show_contested` | Jordan contests the no-show report |
| `case.report_user` | A message urging off-platform cash payment, reported |
| `admin.refund_over_limit` | Alex tries a $150 goodwill refund → needs approval; Morgan approves |
| `admin.reward_review` | Dana and Devon share a device and card fingerprint; welcome grant in review |
| `admin.reconciliation_exception` | One unexplained difference |
| `admin.aging_funds` | A booking funded 23 days ago with an open dispute |
| `admin.policy_v2_draft` | Policy v2 draft (late-fee minimum $12) next to v1 published: "Existing bookings keep v1" |

Open public tasks for the board: desk (Mueller, before booking), Ben's yard cleanup (Crestview, $120), Ana's light cleaning (Hyde Park, $110), and Ruth's remote computer help (before booking).

## 8. Transitions (mock actions move the scenario)

| From | Action | To |
|---|---|---|
| `desk.open.offers` | `book_offer` (Jordan) | `desk.pending_funding` |
| `desk.pending_funding` | `pay` with demo outcome success / declined / 3-D Secure | `desk.confirmed` / `desk.payment_declined` / `desk.payment_3ds` |
| `desk.payment_declined` | `pay` success | `desk.confirmed` |
| `desk.payment_3ds` | approve / fail | `desk.confirmed` / `desk.payment_declined` |
| `desk.confirmed` | `cancel` (poster) / `cancel` (helper) / `propose_change` (schedule) | `desk.canceled.poster_early` / `desk.canceled.helper` / `desk.confirmed.change_schedule_proposed` |
| `desk.confirmed.change_schedule_proposed` | accept / decline | `desk.confirmed` (terms v2 shown) / `desk.confirmed` |
| `desk.confirmed.change_price_pending_funding` | `pay_change_difference` | `desk.confirmed` |
| `desk.confirmed.day_of` | `arrived` / `cancel` (poster) | `desk.in_progress` / `desk.canceled.poster_late` |
| `desk.no_show_window` | `report_no_show` | `desk.canceled.helper_no_show` |
| `desk.in_progress` | `submit_completion` / `cant_access` | `desk.completion_submitted` / `desk.cant_access` |
| `desk.cant_access` | `im_here` / (toolbar: time passes) | `desk.in_progress` / `desk.canceled.poster_no_show` |
| `desk.completion_submitted` | `approve` / `report_problem` / (toolbar: time passes) | `desk.completed` / `desk.disputed` / `desk.completed.auto` |
| `desk.disputed` | `offer_settlement` $45 / support `refund_full` | `desk.disputed.settlement_offered` / `desk.canceled.dispute_refund` |
| `desk.disputed.settlement_offered` | `accept_settlement` | `desk.completed.settled` |
| `desk.completed` | `review` (both submitted) | `desk.completed.reviewed` |
| `desk.expenses.completion_submitted` | `approve` | `desk.expenses.completed` |
| `moving.confirmed` | `propose_change` (+1 h) / `submit_completion` (3.5 h) | `moving.cap_increase_requested` / `moving.completion_submitted` |
| `moving.completion_submitted` | `approve` | `moving.completed` |
| `invite.sent` | accept / decline / counter $50 / cancel / (time passes) | `bookshelf.confirmed` / `invite.declined` / `invite.countered` / `invite.canceled` / `invite.expired` |
| `invite.countered` | `accept_counter` | `bookshelf.confirmed_at_50` |
| Onboarding steps | Each placeholder's demo outcome | The matching `onboarding.*` scenario |
| `rewards.welcome_redeemable` | `redeem` → (toolbar: provider delivers) | `rewards.welcome_issuing` → `rewards.welcome_delivered` |
| `rewards.failed` | `reissue` | `rewards.welcome_issuing` |
| `case.dispute.desk` | resolve `settle` $45 | `desk.completed.settled` |

Any action without a row shows a success toast and stays in the current scenario.

## 9. Dev toolbar (development only)

- Floating button (bottom-left, above the bottom nav) opens a sheet with:
  - Viewer picker (§2).
  - Scenario picker (grouped, searchable).
  - The scenario's "now" (overridable).
  - Toggles: **slow loading**, **force error state**, **force empty state**.
  - Demo outcome for placeholders (payment: success / declined / insufficient funds / 3-D Secure; ID check: verified / requires input / canceled; and so on).
  - Feature flags (§12).
- Persists in cookies. Query parameters `?as=<viewer>&scenario=<id>&now=<iso>` override the cookies (used by tests and screenshots).
- Never rendered, and its routes and actions unreachable, when `NODE_ENV=production`.
- `/dev/scenarios` lists every scenario with links that open it as each relevant viewer. `/dev/components` shows the component gallery.

## 10. Canonical fixture text

| Item | Text |
|---|---|
| Desk title | "Assemble a desk (flat-pack, 1 item)" |
| Desk description | "Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator. I don't have tools." |
| Public area | "Mueller, Austin", about a 1-mile circle; Jordan's distance band "about 2 mi" |
| Exact address (participants only) | "1234 Example Lane, Apt 2B, Austin, TX 78723". Access notes: "Buzz 2B. Elevator is on the left." |
| Jordan's offer | "I've built lots of flat-pack desks and I bring my own drill. Saturday at 10:30 works." |
| Sam's offer | "Assembled 100+ desks. I can come at 10:00 and break down the box for recycling." |
| Lee's offer | "Happy to help. I can be there at 12:00." |
| Jordan's headline | "Careful assembly and moving help in East Austin" |
| Sam's headline | "Assembly, moving, and yard help since 2024" |
| Reviews | Maya → Jordan 5★ "Quick, careful, and cleaned up after." · Jordan → Maya 5★ "Clear instructions and easy access." |
| Dispute reason | "One drawer is misaligned and doesn't close." |
| Remote meeting note | "Join link shared in chat 10 minutes before the session." |

## 11. Category details (posting wizard and task pages)

| Category | Structured fields | Minimum price / guidance (Austin, mock) | Blocked keywords (examples) |
|---|---|---|---|
| `furniture-assembly` | items (type: desk / bed / dresser / shelf / table / chair / other; brand optional; quantity 1–20), floor, elevator, tools on site, anchor to wall | $25 · desk $50–$80 | electrical, wiring, gas, plumbing, light fixture |
| `moving-help` | home size (studio → 4+ bedrooms), tasks (load, unload, rearrange, pack), heavy items, flights of stairs | $35 a task (the hourly rate times the hours), 2 h minimum · $32–$40/h | piano, safe, truck, transport, haul away, hazardous |
| `yard-cleanup` | area size (small / medium / large), tasks (leaves, weeding, debris, hand pruning), bags provided, green-waste plan (curbside / poster handles) | $25 · $60–$140 | pesticide, herbicide, weed killer, irrigation, chainsaw, tree removal, ladder |
| `light-cleaning` | bedrooms, bathrooms, supplies provided, extras (inside fridge, inside oven, interior windows), pets | $60 · $90–$160 | mold, biohazard, post-construction |
| `computer-help` | devices (laptop, desktop, phone, tablet, printer, router), issue description, remote OK (screen share only; no remote-control software) | $25 · $35–$70 | crypto wallet, bank login, password |

Timing rules: start ≥ 3 h from now, ≤ 14 days ahead. Blocked keywords stop posting with a link to `/legal/prohibited-tasks`.

## 12. Feature flags (toolbar and mock config)

| Flag | Default | Effect |
|---|---|---|
| `ai_drafting` | on | "Help me describe this" in the wizard |
| `reward.welcome`, `reward.repeat` | on | Reward chips and pages |
| `reward.acceptance`, `reward.completion` | off | Their chips and cards appear only when on |
| `background_checks` | on | When off, in-home categories are hidden for helpers without a check (blueprint D7 contingency) |
| `recurring` | off | Phase-2 recurring UI (prompt 21) |

## 13. Routes added in the UI phase (beyond `docs/blueprint/02` §1)

| Route | Purpose |
|---|---|
| `/app/tasks/[taskId]/offers/[offerId]/confirm` | Booking confirmation and payment |
| `/app/helpers/[handle]/request` | Direct invite, availability-slot request, Book again (`?from=booking:<id>` or `?slot=<id>`) |
| `/app/notifications` | Notification list (phone layout) |
| `/admin/verify` | Staff two-step verification placeholder |
| `/admin/search` | Admin global search results (users, bookings) |
| `/dev/scenarios`, `/dev/components` | Dev only; 404 in production |

Invites open as a sheet on `/app/offers?invite=<id>`, which notifications link to.

### Route dialogs (2026-11-21)

These routes open as a **dialog over the page they're reached from** on a client navigation (a link or the action bar inside the site), and as the **full page** when the URL is loaded on its own: `/app/report/[kind]/[id]`, `/app/saved-searches/new`, `/app/saved-searches/[searchId]/edit`, `/app/bookings/[bookingId]/review`, `…/problem`, `…/changes/new` and `…/rebook`. The interception lives in `src/app/[locale]/@modal/(.)app/` (the root layout's `modal` slot); each page there loads the same data and passes the same Server Actions as its full page.

- **UI.** Each screen offers a dialog version (`ReportDialogScreen`, `NewSavedSearchDialog`, `EditSavedSearchDialog`, `ReviewDialogScreen`, `ReportProblemDialogScreen`, `ProposeChangeDialogScreen`, `ProposeRebookDialogScreen`) made of `RouteDialogHeader` (the page's h1 and a subtitle) and `RouteDialogBody` (`src/ui/components/layout/route-dialog.tsx`), shown in the shared `RouteDialogFrame` (`route-dialog-frame.tsx`).
- **Results.** A form inside a route dialog never follows `redirectTo`: it calls `useRouteDialog().finish(result, message)` (`src/ui/lib/route-dialog.ts`), which toasts the message, goes back and refreshes the page underneath. `useFormAction` does this by itself (`successToast` for the message). Cancel and Done call `close()`.
- **Links.** A link inside a route dialog closes it, then opens its page (the frame handles it; the slot has no catch-all page, see its `default.tsx`). Links that should open a dialog must navigate with the router (`Link`, `router.push`): a full page load always gets the full page.
- **Not intercepted** (full pages): checkout (`…/offers/[offerId]/confirm`), `…/complete`, the change review `…/changes/[changeId]`, `/app/helpers/[handle]/request`, conversations.
