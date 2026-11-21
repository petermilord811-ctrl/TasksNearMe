# Gainesville launch day

Use this to take Gainesville live: what to check the week before, the steps on the day in order, what to watch, and how to roll back. Gainesville has been in pre-launch since 2026-11-17 (migration 0063). Going live opens it to everyone and emails its waitlist. The next cities follow the same steps (blueprint 10 §7).

Rehearsed end to end on 2026-11-21, on the e2e build with its own database (sweep "Launch rehearsal (2026-11-21)"). The run had 320 waitlist entries, Gainesville clients, helpers part-way through setup, a first task, booking, payment, completion and payout, then a pause and a reopening. The times and counts below are from that run.

**Who:**
- **An admin** takes the city live. Only admins can change a market's status or use the outage switch, and every change needs a reason, which is kept in the audit log. Other staff see the Markets section read-only.
- **The on-call engineer** watches the job runner, the email and text providers, and the logs.
- **A support lead** watches the queues and answers with the copy at the end of this runbook.

## The week before

1. **Providers live.** Work through the live activation checklist (blueprint 10 §4): Stripe, Checkr, Twilio's sender registration, the email provider's DNS, Cloudflare and the legal documents.
2. **Launch criteria.** Supply and quality (blueprint 10 §5): at least 40 bookable helpers in Gainesville, including at least 10 in each hero category.
3. **Sign-up open to everyone.** The `beta.sign_up` flag must be off for Gainesville and globally (`/admin/config` → Feature flags). While sign-up is invite-only, the waitlist emails wait, because "we're open" must be true when it arrives.
4. **Search listings.** By default the live site's own pages are indexed (the board and each job hub once they list an open task), and task pages and helper profiles answer `noindex`. Opening those to search is the owner's call on the day, and needs no deploy (sweep J-L6): an admin opens `/admin/config`, **Search engines → Open tasks and profiles to search**, and gives a reason (audited). robots.txt and the sitemap change at once, every page's X-Robots-Tag within 15 seconds, and IndexNow announces the new pages at its next run (within 15 minutes). **Keep tasks and profiles out** reverses it the same way. Only real open tasks, and profiles with a completed task or a review, qualify (docs/seo/PLAN.md §9, §11.6).
5. **Email sending quota.** Resend allows 10 requests a second for the whole team, shared by every key, production and dev alike. Don't run bulk sends from the dev site on the day. The waitlist goes out at about 100 emails a minute, and a send that hits the limit waits and tries once more (J-L4).
6. **Pick the hour.** Between 9 am and 7 pm Eastern. Emails go at once. Texts and pushes that aren't urgent wait through quiet hours, 9 pm to 8 am in the person's market: at 1:53 am the first task's text to a helper was held until 8:00 am.
7. **Look at the Markets card** on `/admin/config` (Markets → "Gainesville, FL"). In the rehearsal it read:
   - status **Pre-launch**, ZIP prefixes **326**, time zone **America/New_York**;
   - "Helpers yet to choose a neighborhood": helpers who still have to finish that step;
   - "Waitlist: 260 people", and "“We're open” email: Goes to 254 people when it's live" (the rest unsubscribed).
8. **Brief support** with the copy at the end of this runbook.

## On the day: take Gainesville live

1. **Sign in** at `/admin` with the two-step code.
2. **Open `/admin/config` → Markets → "Gainesville, FL"** and check the card as in step 7 above.
3. **Click "Take Gainesville live".** The dialog says what will happen. For example, in the rehearsal: "Gainesville opens to everyone. 252 people on its waitlist get one email that it's open, in their language. 6 people with an account there get one message that it's live: by email (unless they turned those off), in the bell and by push."
4. **Write the reason** (at least 10 characters, kept in the audit log), for example "Launch day: Gainesville opens to everyone.", and **confirm** with "Take Gainesville live".
5. **The card turns Live** at once: "Live since <time>, by <your name>", and "“We're open” email: Sent to 0, 254 still going out".
6. **Watch the card** (reload it): about 100 emails a minute, one batch each minute from the job runner. The rehearsal sent 248 in 2 minutes 40 seconds and skipped 6, then the card read "Sent to 248 people". Who's skipped, and why:
   - addresses that unsubscribed;
   - addresses that bounced or complained before;
   - people who already have an account in Gainesville (see "Who hears it" below).
7. **If the card says "N couldn't be sent"**, the provider refused those emails after every retry (5, 30 and 120 minutes later). See "Waitlist emails that failed" below.
8. **Check the public site, signed out:**
   - the home page's hero says "Live in Gainesville, FL" (it said "Opening soon in Gainesville, FL");
   - `/gainesville`, `/gainesville/tasks` and the job hubs load in English and in Spanish (`/es/gainesville`).
   - A job hub with no open task stays out of search ("noindex, follow") until its first task.
   - `/sitemap.xml` keeps Gainesville's pages. They were already listed, because the home page's city counts as open in pre-launch.
9. **First tasks.** Each new task tells the helpers it suits by email at once:
   - Who: helpers with that service and a neighborhood within range, not blocked.
   - What else: saved searches that match it get alerts too.
   - Texts wait through quiet hours.
   - In the rehearsal the first booking went through: offer, booking and payment, completion with a photo, approval, then $72.00 on its way to the helper.

### Who hears it

- **The waitlist, by email only.** One email each, in the language of the page they joined from, with links to post a task or become a helper, the city's page and an unsubscribe link. The waitlist has no phone numbers, so nobody gets a text from it.
- **Accounts in Gainesville, once each, in their language** (J-L2): clients get "TasksNearMe is live in Gainesville. Post your first task, and helpers near you send offers.", and helpers not bookable yet get "…Finish setting up to start getting booked.", linked to their next setup step. It goes by email (the "News about your city" topic: on unless they turned it off, with its own unsubscribe), in the bell, and by push (held through quiet hours), never by text. Bookable helpers and staff hear nothing new. Someone on the waitlist who has an account here gets this message instead of the waitlist email. Going live again, after a pause or a pre-launch round trip, never repeats it. In the rehearsal, 6 accounts heard it, in English and Spanish.
- **Helpers waiting for Gainesville** were already brought in and told when it moved to pre-launch. Going live tells them nothing new.

## If something goes wrong

| Problem | What to do | What it does |
|---|---|---|
| Bookings or payments are broken (a provider is down, or a bug in booking or payment) | `/admin/config` → **Outage switch** → **Pause bookings**, with a reason. **Reopen bookings** when it's over. | New bookings, tips and paid changes stop at once, with a notice on every signed-in page. Existing bookings go on. See [payments-incident.md](payments-incident.md). |
| The launch has to be rolled back (wrong date, a serious bug in the public pages) | Markets → "Gainesville, FL" → **Move Gainesville to pre-launch**, with a reason. | Gainesville's pages stay up and say "Opening soon". Nobody is emailed. Going live again doesn't email the waitlist twice. |
| Gainesville has to disappear (only for a legal or safety reason) | Markets → **Pause Gainesville**, with a reason. **Don't do this to roll back a launch:** the dialog warns that the home page loses its city too. | **The home page, tasksnearme.com, stays up without a city** (sweep J-L1): no counts, map or town, only the cities with their status (Gainesville "Paused for now", unlinked), the waitlist and how it works. `/gainesville` and its pages answer "not found" and leave the sitemap. `/pricing`, `/become-a-helper` and `/waitlist` keep working. Its ZIP codes count as waiting again. Taking it live again emails nobody twice. |
| Waitlist emails failed | Read the provider's dashboard (Resend → Emails, or Postmark → Activity) for the refusals. Fix the cause (a domain, the quota), then ask the engineer to send them again with the query below. | The card's "N couldn't be sent" goes away once they're sent. |
| The email provider says "too many requests" (429) | Nothing at first: each send waits and tries once more, and the waitlist's next batch comes a minute later. If it goes on, stop bulk sends elsewhere on the same Resend team. | |
| The job runner looks stuck (the card doesn't move for 3 minutes) | The engineer checks the logs for `[jobs] waitlist.city_open failed`, and that the runner is on (no `JOBS_DISABLED`). | One run sends for at most 30 seconds before the next job's turn (J-L3), so a slow provider can't hold up charges and payouts. |

For a failure beyond the launch itself, use its runbook:
- [Email or texts down](email-and-sms-down.md)
- [Stripe errors and late webhooks](stripe-errors.md)
- [Background jobs stall or crash](job-runner.md)
- [The database is unreachable](database-unreachable.md)
- [Live updates stop](realtime-dropping.md)
- [A deploy rolled back](deploy-rollback.md)

## Read-only queries

```sql
-- The waitlist email for Gainesville: how many sent, skipped (and why), queued or failed.
select tell_status, tell_reason, count(*) from waitlist_entries
where told_market_id = 'mkt_gainesville' group by 1, 2 order by 1, 2;

-- Texts and pushes held for quiet hours, and when they go.
select channel, count(*), min(send_after) from notification_deliveries
where status = 'held' and reason = 'quiet_hours' group by 1;

-- Who changed the market and the outage switch, and why.
select at, actor_id, action, reason, metadata from audit_log
where action in ('config.market_status', 'config.outage_switch') order by at desc limit 10;
```

Sending failed waitlist emails again (engineer only, after the cause is fixed):

```sql
update waitlist_entries set tell_status = 'queued', tell_attempts = 0, tell_after = now(), tell_reason = null
where told_market_id = 'mkt_gainesville' and tell_status = 'failed';
```

## Copy for support

- **"I was on the waitlist and didn't get an email."** "Thanks for waiting for us! TasksNearMe is now open in Gainesville. You can post a task at tasksnearme.com, or set up a helper profile. If you made an account before today, the news came to your account instead (the bell, and by email unless you turned city news off): everything is ready there."
- **"I signed up before today. Do I need to do anything?"** "No. Your account is ready: post a task, or finish your helper setup to start sending offers."
- **Spanish:** "¡Gracias por esperarnos! TasksNearMe ya está abierto en Gainesville. Puedes publicar una tarea en tasksnearme.com o crear tu perfil de ayudante."
