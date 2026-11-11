# 09 — APIs, provider events, and idempotency

## 1. API style

- The web UI mutates through **Server Actions**. Client components, realtime refreshes, and future native apps use the versioned **JSON API under `/api/v1`**. Both call the same module services ([07-architecture.md](07-architecture.md) §4).
- Authentication: session cookie (web); bearer tokens later for native apps. Staff endpoints also require a TOTP-verified staff session.
- Conventions:
  - JSON bodies validated with Zod.
  - Errors use the shape `{ "error": { "code", "message", "details" } }`.
  - Cursor pagination.
  - **`Idempotency-Key` header is required on every state-changing POST** (§4).
  - Booking mutations return `409 version_conflict` if the booking changed underneath the caller.
- Every response is a role-aware projection. The same booking serializes differently for the poster, the helper, and staff (for example, the poster's payment method is never in the helper projection).

## 2. Main routes

| Route | Actor | Purpose |
|---|---|---|
| `/api/auth/*` | Anyone | Better Auth: email codes, sessions, staff TOTP |
| `GET/PATCH /api/v1/me`, `POST /api/v1/me/mode` | User | Profile, mode switch |
| `POST /api/v1/me/phone/verify-start`, `…/verify-check` | User | Twilio Verify |
| `POST /api/v1/me/export` | User | Data export request |
| `PUT /api/v1/helper/profile`, `PUT /api/v1/helper/services`, `POST /api/v1/helper/portfolio` | Helper | Profile and services |
| `GET /api/v1/helper/status` | Helper | Bookable flag plus missing steps |
| `POST /api/v1/verification/identity-sessions` | Helper | Creates a Stripe Identity session; returns the hosted URL |
| `POST /api/v1/payouts/onboarding-link`, `POST /api/v1/payouts/dashboard-link` | Helper | Stripe-hosted onboarding (Account Link) and Express Dashboard login link |
| `POST /api/v1/verification/background-check` | Helper | Creates a Checkr invitation; returns its URL |
| `POST /api/v1/uploads`, `POST /api/v1/uploads/:id/complete` | User | Presigned upload, then processing |
| `GET/POST /api/v1/locations` | Poster | Saved addresses (encrypted) |
| `POST /api/v1/tasks`, `PATCH /api/v1/tasks/:id`, `POST /api/v1/tasks/:id/publish`, `…/cancel`, `…/reopen` | Poster | Task lifecycle |
| `GET /api/v1/tasks/feed` | Bookable helper | Feed with filters: category, date, distance band, remote |
| `GET /api/v1/tasks/:id` | Any | Role-aware projection (public, helper, owner) |
| `POST /api/v1/ai/task-draft` | Poster | AI-structured draft (flagged, rate-limited) |
| `POST /api/v1/tasks/:id/offers`, `PATCH /api/v1/offers/:id`, `POST /api/v1/offers/:id/withdraw`, `…/decline` | Helper, poster | Offers |
| `POST /api/v1/offers/:id/accept` | Poster | Creates the booking (`pending_funding`) and PaymentIntent; returns `{ bookingId, clientSecret }` |
| `POST /api/v1/invites`; `POST /api/v1/invites/:id/accept` · `decline` · `counter` · `cancel` · `counter/accept` | Poster, helper | Funded direct invites |
| `POST/PATCH/DELETE /api/v1/availability-posts`, `POST /api/v1/availability-posts/:id/request` | Helper, poster | Availability slots → invite |
| `GET /api/v1/bookings`, `GET /api/v1/bookings/:id` | Participants | Lists and hub |
| `POST /api/v1/bookings/:id/refresh` | Poster | Re-sync funding with the provider after client confirmation |
| `GET /api/v1/bookings/:id/address` | Helper (allowed states only) | Decrypts the address; every call is logged |
| `POST /api/v1/bookings/:id/status` | Helper | `on_my_way`, `late`, `arrived` |
| `POST /api/v1/bookings/:id/changes`; `…/changes/:cid/accept` · `decline` · `withdraw` | Participants | Change requests |
| `GET /api/v1/bookings/:id/cancel-preview`, `POST /api/v1/bookings/:id/cancel` | Participants | Policy preview and execution |
| `POST /api/v1/bookings/:id/no-show`, `…/cant-access` | Poster, helper | No-show flows |
| `POST /api/v1/bookings/:id/completion`, `…/expenses` | Helper | Evidence, hours, receipts |
| `POST /api/v1/bookings/:id/approve`, `…/problem` | Poster | Approve or dispute |
| `POST /api/v1/bookings/:id/review`, `…/rebook` | Participants | Review; pre-filled rebook invite |
| `GET /api/v1/threads`, `GET/POST /api/v1/threads/:id/messages`, `POST /api/v1/threads/:id/read` | Participants | Messaging |
| `POST /api/v1/realtime/token` | User | Ably token scoped to `user:{id}` (subscribe only) |
| `POST /api/v1/payment-methods/setup-intent`, `GET/DELETE /api/v1/payment-methods` | Poster | Saved cards (needed for recurring visits) |
| `GET /api/v1/receipts`, `GET /api/v1/earnings` | Poster, helper | Money history |
| `GET /api/v1/rewards`, `POST /api/v1/rewards/:grantId/redeem` | Helper | Rewards |
| `PUT/DELETE /api/v1/saved-helpers/:helperId`, `GET /api/v1/clients`, `POST /api/v1/clients/:posterId/rebook-proposal` | Poster, helper | Repeat business |
| `POST /api/v1/reports`, `POST /api/v1/blocks`, `GET /api/v1/cases`, `GET /api/v1/cases/:id`, `POST /api/v1/cases/:id/messages` | User | Safety and support |
| `GET /api/v1/notifications`, `POST /api/v1/notifications/read`, `POST/DELETE /api/v1/push-subscriptions` | User | Notifications |
| `/admin` Server Actions; `/api/admin/*` for exports | Staff by role | Suspend and ban, hide content, cancel with override, extend timers, approve on behalf, refunds (with limits), hold, release, and reverse transfers, resolve cases, reward review, void, and reissue, policy publishing, audit export |
| `POST /api/webhooks/{stripe, stripe-connect, stripe-v2, tremendous, checkr, twilio, postmark}` | Providers | Signature-verified ingestion (§4.3) |

## 3. Provider events consumed

| Provider | Events | Effect |
|---|---|---|
| Stripe (platform endpoint) | `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.amount_capturable_updated` | Confirm funding, apply change funding, mark failure, release invite authorization, mark invite authorized |
| | `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded` | Refund status and ledger |
| | `charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated` | Chargebacks, holds, evidence deadline, ledger |
| | `radar.early_fraud_warning.created` | Risk hold, review, and possibly a proactive refund |
| | `transfer.created`, `transfer.updated`, `transfer.reversed` | Transfer status |
| | `identity.verification_session.verified`, `.requires_input`, `.processing`, `.canceled`, `.redacted` | Identity status and badge |
| | `setup_intent.succeeded` | Saved payment method (recurring, phase 2) |
| Stripe (event destination, thin events) | `v2.core.account.*` (Accounts v2 configuration, capability, and requirements updates) | The handler retrieves the account, then updates payout account status, requirements due, and the bookable flag. If the team falls back to Accounts v1 controller properties, the equivalents are `account.updated` and `capability.updated` on the Connect endpoint |
| Stripe (Connect endpoint: v1 events from connected accounts, identified by `event.account`) | `payout.created`, `.updated`, `.paid`, `.failed`, `.canceled` | Payout mirror, `paid_out` reconciliation, "Action needed" alerts (payouts still emit v1 events) |
| Tremendous | `ORDERS.APPROVED`, `ORDERS.FAILED`, `ORDERS.CANCELED`, `REWARDS.DELIVERY.SUCCEEDED`, `REWARDS.DELIVERY.FAILED`, `REWARDS.FLAGGED`, `FRAUD_REVIEWS.RELEASED`, `FRAUD_REVIEWS.BLOCKED` | Redemption status, reissue, review |
| Checkr | `invitation.completed`, `invitation.expired`, `report.created`, `report.completed`, `report.suspended`, `report.resumed`, `report.disputed`, `report.engaged`, `report.pre_adverse_action`, `report.post_adverse_action` | Eligibility status and adjudication workflow. Events can arrive out of order, so the handler always fetches the report |
| Twilio | Message status callbacks | Delivery tracking |
| Postmark | Bounce, spam complaint, delivery | Suppress or mark the address; alert on bounces of critical mail |

Event names are as documented by each provider at the time of writing. The webhook fixtures in `tests/fixtures/` are re-recorded from each sandbox before launch.

## 4. Preventing duplicate charges, payouts, and rewards

### 4.1 Principles

1. **The database decides whether something has happened.** Unique constraints are the last line of defense, not the only one.
2. **Reserve, then call.** Write the intent (a `pending` row with a deterministic key) and commit. Then call the provider with an idempotency key derived from that row. Record the result. Reconcile any unknown outcome.
3. **Every handler is safe to run twice, concurrently, and out of order.**

### 4.2 Layers

| Layer | Mechanism | Protects against |
|---|---|---|
| Client → our API | `Idempotency-Key` (UUID created when the action screen loads, reused on retries) stored in `idempotency_keys` (user, key, request hash, response). The same key returns the stored response; the same key with a different body returns 422; a key still in flight returns 409 | Double taps, flaky mobile networks, client retries |
| Domain constraints | Partial unique indexes: one active booking per task; one funding payment per booking; **one transfer per (booking, kind, source charge)**, with each kind's total capped under lock; one welcome grant per helper (non-voided); **one booking-level reward per booking**; **one redemption per grant**; one open change request per booking; one review per author per booking | Concurrent requests, race conditions, buggy retries |
| State guards | Transitions only from the expected state, with a `version` check; a repeated approve or cancel returns the current state as a no-op | Replayed user actions, job and user collisions |
| Our server → Stripe | Deterministic keys from our row IDs: `pi:{payment_id}`, `tr:{transfer_id}`, `re:{refund_id}`, `trr:{reversal_id}`, `acct:{user_id}`, `idv:{verification_id}`. Every Stripe object carries `metadata.tnm_id` and `transfer_group = booking:{booking_id}`. Stripe v1 keys can be pruned after 24 h; v2 (Accounts) keys last 30 days. The same key with different parameters is rejected. A concurrent duplicate gets `409 idempotency_key_in_use` and is retried with the same key | Network timeouts and retries. Because provider keys expire, the DB row is the long-term guard |
| Unknown outcomes | A reconciliation job looks up objects by `transfer_group` and metadata, then records the found ID or safely retries | A timeout where we don't know whether the transfer happened |
| Provider → our webhooks | `webhook_events` unique on (provider, provider_event_id); job key = event ID; handlers re-fetch the current object and apply only forward transitions | Redeliveries, out-of-order events |
| Jobs and timers | graphile-worker `job_key` per logical timer (`auto_approve:{booking_id}`); handlers re-check state and due time before acting | Duplicate or stale timers |
| Rewards → gift-card provider | Tremendous `external_id = grant_id`: an identical retry returns the original order; a mismatched retry returns 409, which we treat as a bug and alert on | Double issuing |
| Budgets and totals | `SELECT … FOR UPDATE` on the reward program row (reserve on qualify, release on void); sum of refunds ≤ amount captured and sum of transfers ≤ helper share, both checked under a per-booking advisory lock | Overspending a budget, over-refunding, over-paying |

### 4.3 Worked flows

**Charge (accepting an offer).** See [07-architecture.md](07-architecture.md) §5.
- The `payments` row with key `pi:{payment_id}` is written before the PaymentIntent exists.
- Either confirmation path (the client's `refresh` or the webhook) runs the same `confirmFunding`, which works only from `pending_funding`.
- A second tap reuses the request key and gets the same `clientSecret`.

**Transfer (helper payout).**
1. `booking.completed` → job `create_transfers:{booking_id}`.
2. In one transaction: insert the `transfers` rows (`earnings`, plus `reimbursement` if any) as `scheduled`. The unique constraint on (booking, kind, source charge) makes a duplicate insert a no-op.
3. Commit, then call Stripe to create the transfer with `idempotency_key = tr:{transfer_id}`, `source_transaction = <charge>`, `transfer_group`, and metadata. Store the Stripe ID.
4. On timeout, retry with the same key. If the outcome is still unknown later, reconcile by listing transfers in the `transfer_group` and matching `metadata.tnm_id`. Never create a new key for the same row.

**Reward redemption.**
1. The helper taps **Redeem**.
2. In one transaction: the grant moves `redeemable → issuing` (state guard) and a `reward_redemptions` row is inserted (unique per grant). Commit.
3. Create the Tremendous order with `external_id = grant_id`. Retries return the same order.
4. The `REWARDS.DELIVERY.SUCCEEDED` webhook moves the grant to `delivered`. A failure moves it to `failed`, from which reissue creates a new link on the same order.

**Webhook ingestion.**
1. Verify the signature against the raw body.
2. `INSERT … ON CONFLICT DO NOTHING` into `webhook_events`.
3. Enqueue a job keyed by the event ID and return 2xx within milliseconds.
4. The job retrieves the latest provider object (for Stripe, the PaymentIntent, account, or payout) and applies the transition only if it's allowed from the current state.
5. On retry exhaustion the event goes to `failed` (the dead letter), raises an alert, and can be replayed from the admin tooling.

### 4.4 Ordering rules

- Funding `succeeded` is terminal for that payment. A later failure event for an earlier attempt on the same PaymentIntent is ignored after re-fetching the PaymentIntent.
- Account, capability, and payout handlers use the **current** provider object, not the order events arrived in.
- Checkr handlers always fetch the report.
- Tremendous delivery only moves forward, except `failed → issuing` on an explicit reissue.

## 5. Internal domain events (outbox)

`task.published`, `task.updated`, `task.canceled`, `offer.created`, `offer.accepted`, `invite.sent`, `invite.resolved`, `booking.pending_funding`, `booking.confirmed`, `booking.checked_in`, `booking.completion_submitted`, `booking.completed`, `booking.disputed`, `booking.canceled`, `change.applied`, `payment.succeeded`, `payment.failed`, `refund.succeeded`, `transfer.created`, `payout.paid`, `payout.failed`, `chargeback.opened`, `chargeback.closed`, `reward.pending`, `reward.redeemable`, `reward.voided`, `reward.delivered`, `review.published`, `case.opened`, `case.resolved`, `helper.bookable_changed`, `user.suspended`.

Each event carries `{ id, type, occurredAt, aggregateId, actor, payload, version }`. Consumers record the event IDs they have processed, so redelivery is harmless.
