# Dispute handling

Use this for the disputes queue: a client reports a problem with finished work, a no-show report, or a cancellation review. It also covers bank chargebacks, which open in the requests queue. A single dispute is **SEV3** and goes through the normal queue. A rise in disputes (more than 3% of bookings on `/admin/metrics`) or a chargeback deadline under 48 hours is worth a lead's attention the same day.

**Who:** support agents work the cases. Support leads, trust & safety and admins take escalated cases, reopen them, and take cases from others. Finance reads cases and adds notes, and approves refunds above $500.

## How a dispute starts

- **A problem with the work.** The client reports it from the booking page (`/app/bookings/[bookingId]/problem`). This is allowed only while the booking is `completion_submitted`, before `approval_due_at` ([src/modules/bookings/completion.ts](../../src/modules/bookings/completion.ts)). The booking becomes `disputed`, and a case opens with `type='dispute'`, `priority='high'` and the client's photos as evidence (`file_ids`).
- **A disputed booking is never approved automatically.** The `bookings.auto_approve` job only touches `completion_submitted` bookings, so the helper's money waits until the case is resolved.
- **Its rewards wait too.** While its booking is `disputed`, a reward can't move to review or become redeemable.
- **No-show reports and cancellation reviews** open in the same queue (`no_show`, `cancellation_review`).
- **Chargebacks** come from Stripe (`charge.dispute.created`). They open a `payment_issue` case in the requests queue with `priority='urgent'`, plus an internal note with the Stripe dispute id and the evidence deadline ([src/modules/payments/stripe-webhooks.ts](../../src/modules/payments/stripe-webhooks.ts)).

## Targets

| | Disputes | Requests (chargebacks) |
|---|---|---|
| First staff reply | 4 h | 24 h, but treat chargebacks as urgent |
| Resolution | 72 h from opening | Before Stripe's evidence deadline |

The clock pauses while the case waits on the client or the helper (`awaiting_poster`, `awaiting_helper`). `/admin/response-times` shows what's past due and what's due within the hour ([src/modules/support/staff-domain.ts](../../src/modules/support/staff-domain.ts)).

## Working a dispute

1. **Take it.** On `/admin/cases?queue=disputes`, open the oldest past-due case and choose "Assign to me".
2. **Read before you write.**
   - The booking (`/admin/bookings/[bookingId]`): its terms, timeline, check-in, completion photos and checklist, change requests and payments.
   - The client's photos on the case.
   - The conversation: open it with a written reason (10 to 500 characters), which is logged as `case.view_conversation`. Read messages only for this case.
3. **Hear both sides.** Reply to the client and the helper (start from a saved reply if one fits). Set "Waiting on {name}" while you wait for an answer; that pauses the clock. Give each person a clear deadline, for example 48 hours.
4. **Escalate** to a lead when the amount is over your refund limit, when there's a safety element (switch to the [safety runbook](safety-escalation.md)), or when either side disputes your reading of the evidence.
5. **Resolve** with the outcome that matches the evidence. The options depend on the booking:

| Resolution | When | What happens |
|---|---|---|
| **Release in full** (`release_full`) | The work was done as agreed | The booking completes and the helper's earnings are scheduled for transfer |
| **Settle** (`settle`) | Part of the work was done | A lower final price: the difference is refunded to the client (`dispute_settlement`) and the helper is paid on the new price |
| **Refund in full** (`refund_full`) | The work wasn't done, or can't be used | The booking is canceled (`cancel_reason='refunded_in_dispute'`) and the client gets the full charge back |
| No action, account action | A dispute raised before the work was submitted; or a person needs action on their account | Nothing moves; record why |

Release, settle and refund are offered only on a paid booking whose work was submitted. Before submission, the options are a full refund or no action ([caseResolutions](../../src/modules/support/staff-domain.ts)). Rework isn't offered yet.

6. **Write the resolution note** for both people: what you decided, what happens to the money, and when. Example: "We've refunded $30.00 for the shelves that weren't installed. It usually reaches your card in 5–10 business days. Jordan is paid for the rest."

## Money and limits

- You can refund up to your limit per booking without approval: agents $100, leads and finance $500. Above that, your refund becomes a request; a lead approves up to $500, finance approves any amount, and nobody approves their own.
- **If a resolution's refund fails,** resolving again won't retry it: the attempt's key is fixed per case. Use the booking's refund tool for the same amount, put the case id in the reason, and note it on the case ([payments incident](payments-incident.md#fixes-by-symptom)).
- **If the helper was already paid** (a late chargeback, or a reopened case): finance can take the transfer back from the booking's staff page (**Helper transfers** → **Take back from the helper**), naming the case, the amount and why (completion plan 5.13). Stripe takes it from the helper's balance; if it's already been paid out to their bank, the attempt is recorded as failed and the money is recovered by hand. The refund to the client comes from platform funds either way.

## Chargebacks

1. Open the urgent `payment_issue` case. The internal note has the Stripe dispute id, the date evidence is due, and where the evidence pack is.
2. **Download the evidence pack** (finance or an admin, after the two-step check): `/api/admin/bookings/[bookingId]/evidence-pack` gives one JSON file for a booking whose charge was disputed ([evidence-pack.ts](../../src/modules/payments/evidence-pack.ts)). It has the dispute and the charge (card brand and last four), the agreed terms and price, the check-in (on my way, arrived), the completed work (note, hours, checklist, photo links), the approval (by the client, automatic, support or settlement), the people's own steps from the audit log, the conversation before and after booking (with photo links), the client's review, refunds, and the booking's ledger journals. It leaves the exact address out. Each download is in the audit log (`booking.evidence_pack_downloaded`). Open the photo links while signed in as staff to attach the images.
3. Finance submits it in the Stripe Dashboard (Payments → Disputes → the dispute); the app doesn't send evidence. The payment shows the chargeback as **Bank dispute** (`chargeback_open`) on the booking pages and the client's payments, and as won or lost once Stripe closes it; its money status (`succeeded`, `refunded`) doesn't change.
4. **The helper's money while it's open:** what hasn't been sent to the helper yet (work waiting for approval, or approved but not transferred) waits: their earnings show it on hold, and the transfers job skips it. It goes out once Stripe closes the dispute, won or lost. What was already sent stays theirs (blueprint 04 §6).
5. When Stripe closes the dispute (`charge.dispute.closed`), a note is added to the case. A lost one is the platform's loss: a `chargeback_loss` journal in the ledger (`ledger_journals`, `ledger_entries`) debits the disputed amount to `expense:chargeback_losses` and Stripe's fee to `expense:processing`, against `cash:stripe_platform`, once per dispute. Resolve the case with the outcome, and decide with finance whether a lost chargeback needs a transfer reversal (see above) or an account action.
6. Each lost chargeback costs a $15 fee, plus $15 if countered (returned on a win; blueprint 04 §8). Two or more from one client is a pattern worth a trust & safety look.

## Patterns to watch

- **Repeated disputes from one client or against one helper.** Check the person page's cases and strikes. Three no-show or late-cancel strikes in 90 days call for a suspension review ([safety escalation](safety-escalation.md)).
- **A dispute rate above the 3% target** on `/admin/metrics`, or a category or area with many more disputes than others. Raise it with the product lead: unclear scope in a category's task form is a common cause.
- **Strike appeals.** A support lead, trust & safety or an admin can reverse a strike from the person page; it's logged as `helper.strike_reversed`, and `/admin/metrics` stops counting it.
