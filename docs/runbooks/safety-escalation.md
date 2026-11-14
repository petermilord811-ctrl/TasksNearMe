# Safety escalation

Use this when anyone reports that they're unsafe or were harmed, threatened or harassed, and when an exact address, contact details or private messages may have reached someone who shouldn't have them. **Someone in danger now is always SEV1.** So is a privacy exposure. Harassment and threats with nobody in immediate danger are SEV2.

**Who:** the trust & safety on-call, 24/7 (blueprint 10 §5). Any staff member who works cases can pick up the safety queue, and must hand off to trust & safety for anything beyond the first reply. Suspensions take trust & safety, a support lead or an admin.

## How reports arrive

| Source | Case | Priority |
|---|---|---|
| The safety button on a booking. It shows "call 911" first, then the report form ([src/modules/bookings/sheets.ts](../../src/modules/bookings/sheets.ts)). Kinds: `unsafe_now`, `harassment`, `threat`, `property_damage`, `other` | `type='safety'` | **urgent** |
| The support form with the safety topic | `type='safety'` | high |
| A report on a profile, task, message or review (`/app/report/[kind]/[id]`) | `report_user` or `report_content`, in the reports queue | high for harassment or scam reasons |

**Nobody is paged.** The `support.safety_report` outbox event has no consumer yet ([gaps](README.md#built-in-gaps)). Until paging exists, the safety on-call keeps `/admin/cases?queue=safety` open and checks it at least every 15 minutes, day and night. The first-reply target is 4 hours, but an `unsafe_now` report needs an answer in minutes.

## Someone is unsafe now

1. **Emergency services come first.** If the reporter says they're in danger, reply at once: "If you're in danger, call 911 now." The app can't call for them.
2. **Find the booking and the people.** The case links the booking (`/admin/bookings/[bookingId]`): who, when, and where (the area name).
3. **Get the address only if responders need it.** On the booking page, "Show the address" asks for a written reason (10 to 500 characters), shows the address, and logs it as `booking.view_address`. Give it only to emergency services, never to the other party.
4. **Stop further contact.** Suspend the helper if the helper is the one reported, or the whole account if the client is (see Suspensions); either ends their sessions at once. Ask the helper to leave if they're still there.
5. **Keep a timeline** in the case's internal notes: who said what, when, and what you did. It's the record for any police request.
6. Tell the trust & safety lead and the duty manager, and open an incident note ([README](README.md#after-every-sev1-or-sev2)).

## Harassment, threats, damage

1. Assign the case to yourself, and set the status to escalated if you're not trust & safety.
2. **Read the conversation only for this case**, with a logged reason (`case.view_conversation` or `booking.view_conversation`). Phone numbers and emails sent before booking were masked; read what's there and don't try to recover what was hidden.
3. **Hear the other side** in writing, unless that would put the reporter at risk.
4. **Decide**, and resolve with an account action if one is needed:
   - Hide a harmful review (leads, trust & safety and admins; logged as `review.hidden`).
   - Suspend the helper.
   - For property damage, see [dispute handling](dispute-handling.md) for the money side. A settlement or refund is the usual remedy; insurance questions go to the duty manager.
5. Tell the reporter what you did, without details about the other person's account: "We've taken action on this account. Thank you for telling us."

## Suspensions

**A helper** (`/admin/users/[userId]` → Suspend; [setHelperSuspension](../../src/modules/accounts/staff.ts)):
- Trust & safety, support leads and admins can suspend, with a reason of at least 10 characters. It's logged as `helper.suspend`.
- It sets `helper_profiles.status='suspended'`, withdraws the helper's open offers, and hides them from search and new bookings.
- **It doesn't cancel bookings already confirmed.** Look at the helper's upcoming bookings on the person page and cancel each one from its staff page (**Cancel this booking**, with a reason): the client gets the whole charge back, the helper gets no compensation and no strike, and both are told it was support (`booking.canceled_by_staff`). Leads, trust & safety and admins can; a support agent only when the refund is within their limit. Then offer to help the client find a replacement.
- Reinstating works from the same page (`helper.reinstate`).

**A whole account** (a client, or a helper who must not sign in at all): the person page's **Account** section ([account-moderation.ts](../../src/modules/accounts/account-moderation.ts)).
- **Suspend** (trust & safety, support leads, admins): `users.status='suspended'`, every current session ends at once, sign-in is refused, and the helper profile is suspended (open offers withdrawn). **Reinstate** lifts it (`account.suspended`, `account.reinstated`).
- **Ban** takes two people (blueprint 08): trust & safety or an admin **requests** it with the reason, and a *different* trust & safety member or admin **approves** it (or declines). Approved, it does everything a suspension does, with `users.status='banned'`; only an admin can lift a ban (`account.ban_requested`, `account.banned`, `account.ban_declined`).
- Staff accounts have none of these: remove their staff roles first.

**Strikes:** three no-show or late-cancellation strikes within 90 days call for a suspension review (blueprint 06 §2). On appeal, trust & safety, a lead or an admin can reverse a strike (`helper.strike_reversed`).

## A privacy exposure (an address, contact details or messages)

An "address exposure incident" is any exact address shown to someone other than the client, the booked helper while the address window is open, or staff with a logged reason. It's also tracked as a launch target with a goal of zero (blueprint 01 §9). The app can't detect one, so `/admin/metrics` shows it as "Not counted here", and every incident is logged by hand (step 5 below).

1. **Stop it.** If a bug is showing the address, the on-call engineer ships a fix or takes the page down. For a person who shared it (a screenshot, say), hide the content and suspend if needed.
2. **Find who saw what.** `/admin/audit` (admins and support leads) has every staff read: filter by action (`booking.view_address`, `booking.view_conversation`, `case.view_conversation`) and by booking id. For a bug, the engineer reads the server logs for the route and the time window.
3. **Tell the person whose address it was**, plainly: what was shown, to whom, for how long, and what we did. Ask the duty manager whether the incident needs to be reported under the privacy notice or state law (Texas has breach-notice rules for personal information).
4. **Rotate what you can.** An exact address can't be rotated; offer to cancel and refund upcoming bookings at that address if the person wants that.
5. **Log the incident** in `docs/runbooks/incidents/` (one file per incident: date, what was exposed, to whom, how, the fix), and count it for the privacy target.

## Staff access rules (every time)

- Read restricted data (exact addresses, conversations, verification documents) only for the case in front of you, with a reason that names it. Every read is logged and reviewed.
- Never share one person's contact details or address with the other party.
- Never look up people you know.
- `/admin/audit` is read by admins and support leads; nobody can edit it.
