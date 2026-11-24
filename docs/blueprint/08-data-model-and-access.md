# 08 — Data model and access rules

## 1. Conventions

- PostgreSQL 16+ with PostGIS. Primary keys are UUIDv7 (`uuid`, time-ordered, generated in the app). Public URLs use slugs (`desk-assembly-mueller-7f3k`) or handles, never sequential IDs.
- Money is `bigint` cents plus `currency char(3)` (always `USD` at launch). Fees are stored as computed lines, not re-derived later.
- Status fields are `text` with `CHECK` constraints, which are easier to migrate than Postgres enums. Every table has `created_at` and `updated_at`; `deleted_at` exists only where soft deletion is needed.
- Geometry columns are SRID 4326. Distance queries cast to `geography`.
- **Append-only** tables (no `UPDATE`/`DELETE` grants for the app role): `booking_events`, `booking_terms`, `ledger_entries`, `ledger_journals`, `audit_log`, `case_events`.
- Each table has exactly one owning module ([07-architecture.md](07-architecture.md) §3).

## 2. Relationships at a glance

```
users ─1:1─ helper_profiles ─1:N─ helper_services ─N:1─ categories
  │  └─1:1─ payout_accounts (Stripe connected account)      markets ─1:N─ areas, market_policies, market_categories
  │  └─1:N─ identity_verifications, eligibility_checks
  │
  ├─1:N─ locations (poster's saved addresses, encrypted) ─1:N─ tasks
  ├─1:N─ tasks ─1:N─ offers ─1:N─ offer_revisions
  │          ├─1:N─ invites ─0:1─ payments (authorization)
  │          └─1:N─ bookings (≤ 1 active per one-time task)
  │                    ├─1:N─ booking_terms (immutable versions)   ├─1:N─ booking_change_requests
  │                    ├─1:N─ payments ─1:N─ refunds               ├─1:N─ transfers ─1:N─ transfer_reversals
  │                    ├─1:N─ completion_submissions, expense_items├─1:1─ threads ─1:N─ messages
  │                    ├─0:2─ reviews                              ├─1:N─ cases ─1:N─ case_events
  │                    └─N:1─ booking_series (phase 2)             └─0:N─ reward_grants ─0:1─ reward_redemptions
  └─1:N─ reward_grants ─N:1─ reward_programs
ledger_journals ─1:N─ ledger_entries ─N:1─ ledger_accounts   (journals reference payment / refund / transfer / grant)
```

## 3. Tables by module (key fields only)

### accounts
| Table | Key fields | Constraints and notes |
|---|---|---|
| `users` | id, email (citext), email_verified_at, phone_e164, phone_verified_at, first_name, last_name (private), avatar_file_id, default_mode (`poster`/`helper`), home_market_id, status (`active`/`restricted`/`suspended`/`banned`/`deleted`), adult_attested_at, contact_sharing (`none`/`email`/`phone`/`email_phone`, 2026-11-24) | Unique email; unique phone when not null. Public display name = first name + last initial |
| Auth tables (Better Auth) | sessions, accounts, verifications, two-factor | Managed by the library's Drizzle adapter; staff sessions are shorter and require TOTP. `accounts` holds connected Google and Microsoft sign-ins (provider tokens encrypted at rest). An email from a provider creates or joins an account only when the provider confirms it |
| `staff_roles` | user_id, role (`support_agent`/`support_lead`/`trust_safety`/`finance`/`admin`), granted_by, granted_at | PK (user_id, role); every change is audited |
| `usernames` | user_id (PK), username (lowercase), changed_at | Unique on lower(username); 3–20 of a–z, 0–9, `_`, starting with a letter; changed at most once in 30 days; deleted with the account (2026-11-22) |
| `agreements` | user_id, doc (`terms`, `privacy`, `helper_agreement`, `rewards_terms`, `bg_check_disclosure`, `biometric_consent`), version, accepted_at, ip, user_agent | Unique (user_id, doc, version) |
| `blocks` | blocker_id, blocked_id | Blocked users can't message, offer, or invite each other |

### profiles
| Table | Key fields | Constraints and notes |
|---|---|---|
| `helper_profiles` | user_id (PK), handle, headline, bio, status (`draft`/`active`/`paused`/`suspended`), service_center (fuzzed point), service_radius_km, remote_ok, tools[], languages[], completed_count, rating_avg, rating_count, response_time_p50_min, is_bookable (cached) | Unique handle. Stats are updated by events, not by hand |
| `helper_services` | helper_user_id, category_id, pricing_type, rate_cents or from_price_cents, min_hours, description, active | Unique (helper, category) |
| `portfolio_items` | helper_user_id, file_id, category_id, caption, moderation_status | Public only when `approved` |
| `saved_helpers` | poster_user_id, helper_user_id | PK pair |

### verification
| Table | Key fields | Constraints and notes |
|---|---|---|
| `identity_verifications` | user_id, provider (`persona`, or `stripe_identity` as the fallback; `dev` outside production), provider_session_id (Persona's inquiry id), status (`created`/`processing`/`requires_input`/`verified`/`canceled`/`redacted`), verified_at, checks (doc/selfie pass flags), is_adult, name_matches_profile, last_error_code; provider_outcome and provider_event_at (the provider's own word for its newest applied event, and when it was made, so late or repeated events change nothing; added 2026-11-13); review_outcome, reviewed_at, reviewed_by (staff's decision when the double check didn't confirm our approval: `retry_allowed` or `rejected`); expiry_notices (on an `id_expiring` request row: the 30-day and the ran-out notices, 6.3) | Unique provider_session_id. **No images, DOB, or ID numbers are stored** |
| `eligibility_checks` | user_id, type (`background_check`), provider (`checkr`), candidate_id, invitation_id, report_id, package, status (`invited`/`pending`/`clear`/`consider`/`suspended`/`canceled`/`expired`), adjudication (`engaged`/`pre_adverse`/`post_adverse`), completed_at, expires_at | Unique report_id. Report contents stay at Checkr |
| `identity_captures` (added 2026-11-13) | user_id, document_type (`drivers_license`/`state_id`/`passport`), front_file_id, back_file_id, selfie_file_id, prompt_key, status (`submitted`/`approved`/`rejected`/`canceled`), rejection_reason, auto_check (yes/no answers and the expiry month and year only), submitted_at, decided_at, decided_by, staff_note, files_deleted_at; document_hash (a keyed hash of the number, issuing state and birth date; 6.3), duplicate_of_user_id, duplicate_cleared_at, duplicate_cleared_by | Our own ID check (stage 1, 06 §1). One `submitted` row per person. The photos are private files (`id_document`, `id_selfie`), **encrypted**, deleted once both stages are final and at the latest 30 days after the decision. **No name, DOB or ID number is stored** |
| `address_verifications` (added 2026-11-12) | user_id, status (`requested`/`in_review`/`verified`/`rejected`/`withdrawn`), address_ciphertext, area_id, document_type, document_file_id, document_deleted_at, submitted_at, decided_at, decided_by, rejection_reason, auto_check (yes/no answers only) | The document is a private file, deleted 30 days after the decision. Built as `address_verifications`; the background checks table is `background_checks` |

### markets
| Table | Key fields | Constraints and notes |
|---|---|---|
| `markets` | slug (`austin`), name, state, timezone (`America/Chicago`), currency, boundary (multipolygon), center, status (`prelaunch`/`live`/`paused`) | A new city = a new row plus seeds |
| `areas` | market_id, slug, name (`Mueller`), boundary, centroid | Source of "general area" names. City areas (`city-waco-tx`, "Waco, TX", centered on a ZIP's Census center) hold tasks posted outside the market's service area (2026-11-21); neighborhood lists leave them out |
| `categories` | slug, name, in_home, remote_allowed, requires_background_check, default_pricing_type, min_price_cents, required_evidence (photos_min, hours, receipts), prohibited_keywords[] | — |
| `market_categories` | market_id, category_id, enabled, price_guidance (p25/p50/p75 and unit) | PK pair |
| `market_policies` | market_id, version, status (`draft`/`published`/`retired`), effective_from, fee_schedule, cancellation, timers, published_by | Unique (market, version). **Immutable once published.** Bookings reference the version they were confirmed under |
| `feature_flags` | key, market_id (null = global), enabled, rules | PK (key, market_id) |

### tasks
| Table | Key fields | Constraints and notes |
|---|---|---|
| `locations` | owner_user_id, label, address_ciphertext, exact_point_ciphertext, key_version, public_point (deterministic fuzz), area_id | Restricted. Only the tasks module decrypts, and only through an audited accessor |
| `tasks` | slug, poster_user_id, market_id, category_id, title, description, details (category fields), mode (`local`/`remote`), status, pricing_type, budget_cents, hourly_rate_cents, estimated_hours, hours_cap, expense_allowance_cents, window_start, window_end, location_id, public_area_id, public_point, helpers_needed, ai_generation_id, published_at, expires_at, version | GiST index on public_point; partial index on status = `open` |
| `task_private_details` | task_id (PK), access_notes_ciphertext, key_version | Gate codes and similar. Released only with the address |
| `task_photos` | task_id, file_id, position | Visible to bookable helpers, participants, and staff |
| `ai_generations` | user_id, task_id, model, prompt_version, input_tokens, output_tokens, status (`ok`/`refusal`/`error`), output, accepted | No PII in inputs (see 07 §8) |

### offers
| Table | Key fields | Constraints and notes |
|---|---|---|
| `offers` | task_id, helper_user_id, status, current_revision_id, expires_at | Partial unique (task, helper) where status in (`pending`, `stale`) |
| `offer_revisions` | offer_id, revision_no, pricing_type, price_cents, hourly_rate_cents, hours_cap, proposed_start, message, brings[] | Immutable |
| `invites` | task_id, poster_user_id, helper_user_id, source (`profile`/`saved`/`availability`/`rebook`/`client_proposal`), terms (snapshot), counter_terms, status, payment_id, expires_at | Partial unique (task, helper) while active |
| `availability_posts` | helper_user_id, market_id, category_ids[], center (fuzzed), radius_km, starts_at, ends_at, pricing_type, rate_cents, status (`active`/`held`/`booked`/`expired`/`canceled`), held_by_invite_id | — |

### bookings
| Table | Key fields | Constraints and notes |
|---|---|---|
| `bookings` | task_id, poster_user_id, helper_user_id, source, source_id, status, cancel_reason, completed_via, current_terms_version, market_policy_id, scheduled_start, scheduled_end, address_released_at, address_hidden_at, checked_in_at, completion_submitted_at, approval_due_at, completed_at, canceled_at, canceled_by_role, series_id, visit_index, version | **Partial unique (task_id) where status ≠ `canceled` and series_id is null.** `CHECK (poster_user_id <> helper_user_id)` |
| `booking_terms` | booking_id, version, pricing_type, price_cents, hourly_rate_cents, hours_cap, expense_allowance_cents, scope_text, scope_details, schedule_start, schedule_end, poster_fee_cents, helper_fee_cents, poster_total_cents, helper_expected_earnings_cents, fee_schedule (snapshot), accepted_by_poster_at, accepted_by_helper_at | Unique (booking, version). Immutable. This is the breakdown both people saw and accepted |
| `booking_change_requests` | booking_id, proposed_by_user_id, type, base_terms_version, proposed_terms, delta_poster_total_cents, status, funding_payment_id, expires_at | Partial unique (booking) where status in (`proposed`, `accepted_pending_funding`) |
| `booking_events` | booking_id, type, actor_user_id, actor_role, data | Append-only timeline |
| `completion_submissions` | booking_id, submitted_by, note, hours_worked, status; `completion_files` (submission_id, file_id, kind `photo`/`receipt`) | — |
| `expense_items` | booking_id, submission_id, description, amount_cents, receipt_file_id, status, decided_by, decided_at | Sum of approved items ≤ the terms' allowance |
| `booking_followers` (2026-11-24) | booking_id, follower_user_id, added_by_user_id, created_at, ended_at, ended_by (`client`, `follower`) | Partial unique (booking, follower) where ended_at is null; at most 2 open per booking, checked with the booking row locked. Family followers (§4.1) |
| `booking_teams` (2026-11-24, 03 §4.1) | lead_booking_id, task_id, client/lead/partner user ids, status (`invited`/`accepted`/`confirmed`/`declined`/`withdrawn`/`canceled`/`refused`; `expired` is computed when read), pricing (fixed price, or hourly rate with estimate and cap), note, team_thread_id (the lead and partner's direct conversation), partner_task_id and partner_offer_id once confirmed, client_kept_at, answered/confirmed/closed at | One invite in play per lead booking (partial unique where status is `invited` or `accepted`); partial unique partner_task_id. The partner's part is its own task, a copy of the lead's (`tasks.team_part_of` = the lead booking), booked through the normal confirm flow: its own booking, money and states. Team parts never reopen and stay off the board, feeds and My tasks |
| `booking_series` (phase 2) | poster/helper ids, category_id, location_id, cadence, weekday, window, per_visit_terms, status, paused_until, next_visit_date, payment_method_ref | — |

### payments
| Table | Key fields | Constraints and notes |
|---|---|---|
| `stripe_customers` | user_id (PK), stripe_customer_id | Unique |
| `payout_accounts` | user_id (PK), stripe_account_id, details_submitted, transfers_capability, payouts_enabled, requirements_currently_due[], requirements_past_due[], disabled_reason | Status only. Bank and tax data stay at Stripe |
| `payments` | purpose (`booking_funding`/`invite_authorization`/`change_funding`/`visit_funding`), booking_id, invite_id, change_request_id, payer_user_id, amount_cents, capture_method, stripe_payment_intent_id, stripe_charge_id, status, failure_code, idempotency_key | Unique PI id, charge id, and idempotency key. **Partial unique (booking_id) where purpose = `booking_funding`** |
| `payment_lines` | payment_id, kind (`task_price`/`poster_fee`/`expense_allowance`), amount_cents | Keeps service price, fees, and expense money separate from the first cent |
| `refunds` | payment_id, booking_id, amount_cents, lines (price/fee/allowance split), reason (`cancellation`/`unused_cap`/`unused_allowance`/`change_decrease`/`dispute_settlement`/`goodwill`/`fraud`), stripe_refund_id, status, initiated_by_role, case_id, idempotency_key | Sum of refunds ≤ amount captured (checked under lock) |
| `transfers` | booking_id, kind (`earnings`/`reimbursement`/`cancellation_compensation`), amount_cents, helper_user_id, destination_account_id, source_payment_id, source_charge_id, transfer_group, stripe_transfer_id, status, hold_reason, idempotency_key | **Unique (booking_id, kind, source_payment_id)**, plus a check under a per-booking lock that each kind's total doesn't exceed the amount from the final terms. Together these prevent duplicate payouts. Normally one row per kind; a second row appears only when a funded change added a second charge (a transfer can't exceed its source charge) |
| `transfer_reversals` | transfer_id, amount_cents, reason, stripe_reversal_id, approved_by, idempotency_key | Finance only |
| `payouts`, `payout_items` | stripe_account_id, stripe_payout_id, amount_cents, status, arrival_date, failure_code; items map payout → transfer | Filled by reconciliation from provider balance transactions |
| `chargebacks` | payment_id, stripe_dispute_id, amount_cents, reason, status, evidence_due_by, evidence_submitted_at, outcome | Unique dispute id |
| `ledger_accounts`, `ledger_journals`, `ledger_entries` | Accounts such as `cash:stripe_platform`, `liability:helper_payable`, `liability:reimbursements_payable`, `revenue:poster_fees`, `revenue:helper_fees`, `expense:processing`, `expense:connect`, `expense:goodwill`, `expense:chargeback_losses`, `expense:rewards`, `liability:rewards_payable` | Each journal must balance (deferred constraint trigger). Corrections are new journals, never edits |

### rewards
| Table | Key fields | Constraints and notes |
|---|---|---|
| `reward_programs` | code (`welcome`/`acceptance`/`repeat`/`completion`), market_id, version, status, starts_at, ends_at, rules, budget_cents, reserved_cents, spent_cents | Unique (code, market, version). Budget is changed under a row lock |
| `reward_grants` | program_id, program_version, level (`booking`/`relationship`/`account`), recipient_user_id, booking_id, relationship_key, basis_cents, amount_cents, status, risk_score, hold_until, redeemable_at, expires_at, void_reason | Partial unique indexes where status ≠ `voided`: **welcome** (program, recipient); **booking-level** (booking_id, level = `booking`) — at most one booking-level reward per booking; **repeat** (program, recipient, relationship_key) |
| `reward_redemptions` | grant_id, provider (`tremendous`), external_id (= grant id), provider_order_id, provider_reward_id, delivery_method (`LINK`/`EMAIL`), status, last_error | Unique grant_id and external_id |
| `risk_signals` | subject_user_id, related_user_id, type (`shared_device`, `shared_card_fingerprint`, `shared_bank_fingerprint`, `shared_ip`, `same_address`, `velocity`, `new_account_pair`), weight, data | Feeds reward review and fraud queues |

### messaging, notifications, reviews, support, platform
| Table | Key fields | Constraints and notes |
|---|---|---|
| `threads`, `thread_participants` | kind (`offer`/`invite`/`booking`/`case`/`series`/`direct`), linked id (for `direct`: the two user ids in order), task id (null for `direct`), started_by_user_id (`direct`); participants with last_read_at, muted | One thread per offer, invite, booking, or case; one direct conversation per pair of people (2026-11-21) |
| `spark_purchases` | user, pack, points, amount, provider session, status (`pending`/`paid`/`refunded`) | Earned Sparks are counted from community, booking and review rows, never stored (2026-11-21) |
| `messages` | thread_id, sender_user_id (null = system), kind (`text`/`system`/`status`/`attachment`), body, body_masked, attachment_file_ids[], flagged_at | Contact details masked before confirmation; flagged messages enter the moderation queue |
| `notifications`, `notification_deliveries`, `notification_preferences`, `push_subscriptions` | Per-user inbox; per-channel delivery with provider message id; endpoint keys | Unique push endpoint |
| `reviews` | booking_id, author_user_id, subject_user_id, direction, rating (1–5), tags[], body, status (`submitted`/`published`/`hidden`), published_at, hidden_reason | Unique (booking, author). Only for completed bookings |
| `cases`, `case_events`, `reports`, `strikes`, `moderation_actions` | Case type/status/priority/assignee/SLA/resolution; live chat (`live_requested_at`, `live_agent_user_id`, `live_joined_at`, `live_ended_at`, 2026-11-22); events with `internal` or `participants` visibility (`live` events: joined, ended); reports on any target; strikes with expiry; moderation history | — |
| `neighbor_groups`, `neighbor_group_members`, `neighbor_group_invites`, `neighbor_group_messages` (2026-11-24) | Group: market, area (one neighborhood), kind (`building`/`street`), name, creator, status (`active`/`closed`). Member: role (`admin`/`member`), joined, last read, muted, invited by. Invite: code (8 characters, unique), creator, expires (7 days), revoked. Message: author, body as written, status (`visible`/`deleted`/`removed`), moderation fields | At most 3 groups created a person (ever), 50 members a group, 30 messages a minute a person a group. Members only, by an invite they accept, from the group's area. Bodies masked when read, always |
| `files` | owner_user_id, purpose, bucket (`private`/`public`), object_key, content_type, byte_size, sha256, status, metadata_stripped | Only `ready` files are served |
| `outbox_events`, `webhook_events`, `idempotency_keys`, `audit_log` | See [09-apis-events-idempotency.md](09-apis-events-idempotency.md) | `webhook_events` unique (provider, provider_event_id) |

## 4. Access rules

Enforced in each module's `policies.ts`. Integration tests in `tests/integration/access-control` attempt every row below from every actor.

| Resource | Public | Signed-in non-participant | Poster (own) | Helper (participant) | Staff |
|---|---|---|---|---|---|
| Task: title, category, area name, public point, window, budget, offer count | Read | Read | Read/write while `open` | Read | Read; moderate |
| Task: full description and structured details | Excerpt (contact details scrubbed) | Read | Read/write | Read | Read |
| Task photos | — | **Bookable helpers only** | Read/write | Read | Read; remove |
| **Exact address and access notes** | — | — | Read/write | **Read only while confirmed → 48 h after completion**; every read logged | Support, trust & safety, admin: read with a typed reason, logged |
| Offers | — | Count only | Read on own tasks | Own offers read/write | Read |
| Booking terms, timeline, evidence | — | — | Read; actions per state (03 §4) | Read; actions per state | Read; actions per role |
| Messages | — | — | Own threads | Own threads | Read only when handling a case or report on that thread, with a reason; logged |
| Helper's email and phone, shared on their profile (2026-11-24) | — | **Only with 2,000 earned Sparks**, when the helper turned sharing on (verified details only); shown on tap, 20 a day, every reveal logged | — | Own setting (off by default) | Audit log |
| Building and street groups (2026-11-24): name, members, invites, messages | — (never listed, searched or on a public page) | **Nothing**, not even that a group exists. An invite's code shows its group's name, area and size only to someone it admits, someone already in it, or someone it turns away for their neighborhood or its size | Members: read the group, members (first name, last initial, neighborhood; never address, phone or email) and messages masked like a chat before a booking, always; minus anyone they blocked or who blocked them. Write: send, delete own, report others'. Admin: remove members, revoke invites | Same as the column before | Only a reported message, from its case (never the rest of the group); trust & safety, leads, admins remove or restore it with a reason, audited |
| Poster payments and receipts | — | — | Own | Helper-side amounts only (never the poster's payment method) | Support: summary. Finance: full |
| Helper earnings, transfers, payouts | — | — | — | Own | Support: read. Finance: read and act |
| Bank, SSN/TIN, ID documents, selfies, background reports | **Never stored in our app** | — | — | Own data only in the provider-hosted dashboard | Status fields only. Provider dashboards restricted to named finance or trust & safety leads (**F15**) |
| Verification badges | "ID verified" / "Background checked" + month/year | Same | Own statuses | Own statuses | Status and failure codes |
| Reviews | Published | Published | Write own; read both once published | Same | Hide per policy (lead or trust & safety), audited |
| Rewards | Program terms | — | — | Own grants | Support: view, void, reissue. Lead: reinstate, approve reviews. Finance: budgets |
| Cases | — | — | Own cases (participant-visible events) | Own cases | By role |
| Config, policies, fees, flags | Published fees and policies | Same | — | — | Admin only; versioned; audited. Every staff role reads which markets are open and who waits for them (plan 8.2) |
| Audit log | — | — | — | — | Read: admin and support lead. Nobody can edit |
| A booking, for a **family follower** (2026-11-24, §4.1) | — | **Read only, for the people its client added**: status and time, the helper's public profile, the conversation as the client sees it (masked the same way), day-of status lines | Adds (by @username or email of an existing account) and removes followers | Always sees who follows (display names) | As for the booking |

### 4.1 Family followers (2026-11-24, owner's chat ideas)

This changes who can read a booking. A booking's client may let up to **2** existing accounts follow it: an adult child following a parent's booking, or the reverse (01 personas: "an adult child arranging help for a parent").

- **A follower reads, never acts.** They see the booking's status and time on the market's clock, the general area (never the exact address), the helper's public profile, the conversation's messages as the client sees them (masked until payment, the same way), and its day-of status lines (on the way, arrived, done, canceled; never a line about payments, tips, refunds, earnings, changes or reviews). They can't send messages, react, pay, change, cancel, review, report, or see any money or payment detail.
- **Never a participant.** A follower is not a thread participant and never resolves to the booking's client or helper role, so every check meant for those two (sending, read marks and "Seen", booking actions, the exact address, money) refuses them by construction. Their page and conversation are separate, read-only projections (`followers/service.ts`, `messaging/service.ts` `followerThreadPage`).
- **Transparency.** The helper always sees that someone follows ("Maya's family member Lia follows this booking") and gets a status line when a follower is added, removed or leaves. A follower's contact details are never shown to anyone; only their display name.
- **Notifications.** The follower is told once when added, then about the key moments only: on the way, arrived, done, canceled, a new time.
- **Ending.** The client removes a follower at any time; a follower can leave. Following ends on its own when the booking is canceled, or 7 days after it's done. Regular visits (series) can't be followed yet.

### Staff roles and limits (configurable)

| Role | Can do | Limits |
|---|---|---|
| `support_agent` | Cases, cancellations with policy override, timer extensions, refunds, reward void and reissue | Refund ≤ **$100** per booking without approval; no config, no transfer reversals |
| `support_lead` | Everything above, plus approving reward reviews, reinstating rewards, hiding reviews per policy, temporary suspensions | Refund ≤ **$500** per booking |
| `trust_safety` | Safety cases, suspensions and bans, background-check adjudication workflow, message access for reports | Bans need a second reviewer |
| `finance` | Any refund, transfer reversals, chargeback evidence, reconciliation, reward budgets | **Dual approval above $500**; reversals need a case link |
| `admin` | Market config, fee schedules, policies, flags, staff roles | At least two admins; every change is versioned and audited |

There is no direct database editing and no impersonation in production. Support uses read-only "view as" pages that render what a user sees, minus restricted fields, and every view is logged.

## 5. Retention defaults (to confirm with counsel, F20)

| Data | Default |
|---|---|
| Exact address shown to the helper | Hidden 48 h after completion |
| Exact address in storage | Kept while the poster keeps it as a saved location; otherwise deleted 180 days after the last booking. At once when the account is deleted (2026-11-21) |
| Messages, completion photos, receipts | 2 years after last activity; longer while a case or legal hold is open |
| Task photos (added 2026-11-21) | 2 years after the task closes (completed, canceled or expired, with every booking of it over as long), never while a case about one is open; an upload never posted, 2 years after it was added. At once when the account is deleted |
| Ledger, payments, tax records | 7 years |
| Identity verification | Status kept. Provider-held images handled per the provider's retention and redaction settings, within Texas biometric limits (**F10**). Our own capture's photos (06 §1): deleted once both stages are final (the double check cleared the ID), and at the latest 30 days after the stage-1 decision; at once when canceled or the account is deleted; the row and its answers stay. The ID's keyed hash (6.3) goes with a deleted account, unless the account was banned |
| Proof of address | Status, dates and the encrypted address kept; the document deleted 30 days after the decision, at once when the account is deleted. A deleted account's address (2026-11-21): kept encrypted for claims and investigations of its real jobs until 2 years after its last booking, longer while a case or legal hold is open, then deleted; deleted at once when it had no booking; a banned account keeps it with the ID hash |
| Background checks | Status kept; report contents stay with the provider (FCRA) |
| Audit log | 7 years. A deleted account's rows keep ids and what happened, not its contact details: an email change's addresses, passkey names and IP addresses are removed, unless the account was banned (2026-11-21) |
