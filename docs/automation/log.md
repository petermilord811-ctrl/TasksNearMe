# Autopilot log

One entry per iteration, newest last.

## 2026-11-10 — setup
- Installed the Codex CLI (0.167.1, signed in through ChatGPT). A smoke test of an unattended run passed: sandboxed writes and network work; npm's cache needed an explicit `--add-dir`.
- Added `scripts/codex-run.mjs`. It runs a ticket in worktree `../TasksNearMe-ui` on port 3100, re-checks the result with `check:ui`, commits on the ticket branch, and writes `automation/runs/<ticket>.json`.
- Added this runbook (`AUTOPILOT.md`) and the state, decisions, and blocked files. `AGENTS.md` now has unattended-run rules; Codex no longer edits `docs/ui/progress.md`.
- Environment: Docker is installed but the daemon is stopped; no local Postgres. The database decision is the next Phase 1 step.

## 2026-11-11 — iteration 1 (Phase 1: database)
- Codex: UI-002 started unattended at 05:50 UTC (worktree `../TasksNearMe-ui`, branch `ui/UI-002-shells-navigation`).
- Started Docker Desktop. Postgres 17.5 + PostGIS 3.5 runs in container `tasksnearme-db` (port 54329), with dev and test databases.
- Added Drizzle: `drizzle.config.ts`, `src/platform/db/{connect,client,schema,columns,ids}.ts`, and the schemas for markets, areas, categories, market categories, policies, feature flags, `audit_log`, `outbox_events`. Migrations `0000_postgis`, `0001_markets_audit_outbox`.
- Seeds: Austin market, 12 areas, 5 categories with price guidance, policy v1 (published) and v2 (draft), flags. Scripts: `db:up/down/generate/migrate/seed/reset`, `test:db`.
- Checks: `npm run check` (55 tests) and `npm run test:db` (4 tests) pass.

## 2026-11-11 — iteration 2 (Phase 1: auth, people, shells)
- Codex: UI-002 handed off (22 min) and merged; UI-003 launched at 06:17 UTC and handed off at 06:33 UTC.
- Auth: Better Auth (email one-time codes, Drizzle adapter, prefixed ids), dev email outbox (`/dev/outbox`), `getViewer()`, `setMode`, `signOut`, staff two-step dev check, `/dev/sign-in`, optimistic `/app` redirect in `src/proxy.ts`. Migration `0002_accounts_profiles_dev_outbox`.
- People: users, staff roles, helper profiles, and services seeded from the canonical fixtures (Maya, Chris, Ruth, Ben, Ana, Jordan, Sam, Lee, Priya, five staff).
- UI-002 wired: route groups `(public)`, `(app)/app`, `admin/(gated)` render the Codex shells with the viewer.
- Fixed: parallel e2e sign-ins replaced each other's codes (now serialized per email); placeholder pages no longer nest `<main>`; `typecheck` runs `next typegen` first.
- Checks: `check` 126 tests, `test:db` 9, `e2e` 8 (mobile and desktop), `build` pass.

## 2026-11-11 — iteration 3 (public site, sign-in, content)
- UI-003 wired: fee engine (`modules/payments/fees`), cached market, category, and helper queries, seven public routes, metadata, and 12 e2e tests.
- UI-004 (Codex, 32 min) merged and wired:
  - `/sign-in`: server-driven steps, phone verification with a fake SMS provider, DB rate limits.
  - `/waitlist`, `/help`, `/help/[article]`, `/legal/[doc]`, with 8 help articles and 7 legal drafts.
  - 16 e2e tests.
- The runner's independent check failed only on environment problems: no `.env.local` in the worktree, and the harness timing out with 116+ previews. Fixed with an env copy, `/dev/ui` readiness, and a sharded harness.
- Mistake: `npm ci` in the main checkout while the dev server ran. Windows file locks left `node_modules` half-deleted. Recovered by stopping the server and reinstalling; added a runbook rule.
- UI-005 (board, public task, helper profile, `PublicShell` promise fix) launched at 07:20 UTC.
- Checks: `check` 277, `test:db` 15, `e2e` 36, `build` pass.

## 2026-11-11 — iteration 4 (tasks, posting, profiles)
- Codex:
  - UI-005 (19 min) and UI-006 (24 min) were handed off and merged.
  - UI-007 (16 min) failed its independent check only because of a flaky test of mine (encryption tamper test flipping a base64 padding bit). Fixed, then merged.
  - UI-024 launched.
- Wired:
  - the board, the public task page, and helper profiles (reviews and work samples);
  - recent tasks on public pages;
  - the posting wizard backend: uploads, files route, AI drafter, quote, post;
  - `/app/tasks/new`.
- Performance: Partial Prefetching moved to the `/app` and `/admin` segments; public pages render once (home 390 KB → 197 KB).
- Bugs found by e2e:
  - The details schema rejected unanswered optional fields (undefined, null, NaN). Fixed in the contract.
  - The wizard posts when "Next" is pressed on the budget step (Codex UI bug). Sent as UI-024; that e2e test is fixme until it lands.
- Contract requests accepted: a yard green-waste plan instead of haul-away (also noticed independently), `onResolvePhotos`, and a per-person draft key.
- Checks: `check` 457, `test:db` 23, `e2e` 50 (posting fixme), `build` pass.

## 2026-11-11 — iteration 5 (offers, helper onboarding)
- Codex:
  - UI-024 (11 min): the wizard posted on Next. Fixed, merged, and the posting e2e test re-enabled. Its independent check had failed only on a transient `ERR_NETWORK_CHANGED`, which the harness now ignores.
  - UI-008 (21 min) merged.
  - UI-009 launched.
- Wired UI-007:
  - offers module: schema, migration 0006, domain actions, masked message segments, owner projections with fee-engine breakdowns, decline, cancel with a reason, seen markers;
  - seeded offers;
  - three poster pages;
  - integration tests (6) and e2e poster flows.
- e2e infrastructure:
  - the `e2e-setup` project reseeds and removes posting leftovers;
  - one retry, after a dev-server manifest race returned a single 500;
  - a run that overlapped Codex's check on the same machine failed broadly; re-runs were clean.
- Prepared UI-008 and UI-009 contracts: onboarding (form schemas, provider statuses, handlers) and helper work (feed, blocked reasons, offer schema factory).
- Checks: `check` 540, `test:db` 29, `e2e` 60 (3 skips by design), `check:ui` pass.

## 2026-11-11 — iteration 6 (helper onboarding, find work, booking and paying)
- Codex:
  - UI-009 (26 min) merged: find work, the helper task view, the offer form, my offers.
  - UI-010 (24 min) merged: the confirmation page, payment picker, bank dialog, cancellation summary.
  - UI-011 launched: the bookings list and the booking page.
- Wired:
  - UI-008: verification module and migration 0007, development provider stand-ins, onboarding and editor routes.
  - UI-009: helper offers service (feed with distance bands, task view projection, send, revise, withdraw, re-confirm, limits, lazy expiry).
  - UI-010: bookings and payments (migration 0008), the development payment stand-in, the confirmation route, the booking redirect placeholder.
- e2e infrastructure: `POST /dev/cache` clears cached public pages after the reseed; the seed clears bookings on seeded tasks; reserved tasks for the offer and booking flows.
- A stale Turbopack module ("is not a function" for a new export) needed a dev server restart; stopping the shell doesn't end `next dev` on Windows (AUTOPILOT gotchas).

## 2026-11-11 — iteration 8 (completion, messaging, sheets, money)
- Codex:
  - UI-013 (23 min). The runner's check failed on an untouched test under load; merged.
  - UI-014 (42 min), merged.
  - UI-012 (24 min). The check failed on flaky UI-013 focus tests; merged, and the fix was requested.
  - UI-016 (28 min), merged; the focus tests are now deterministic.
  - UI-030 launched (a phone bug found by e2e).
- Backends:
  - completion and problem reports (migration 0010);
  - messaging (0011);
  - cancellations, refunds, strikes, no-shows, safety (0012);
  - earnings ledger and payouts (0013);
  - the home.
- Each ticket was wired with e2e: completion, messaging, booking sheets (desktop; phones wait for UI-030), and money.
- Tooling: unit tests got a 15 s timeout and testing-library waits 3 s, because checks share the machine.

## 2026-11-11 — iteration 9 (home, reviews, notifications, support)
- Codex:
  - UI-030 (phones: the tab bar covered the action bar), merged; the phone e2e is back on.
  - UI-023 (home dashboards, 29 min) and UI-015 (reviews and saved helpers, 25 min), merged and wired.
  - UI-017 (notifications and the account page, 33 min), merged and wired.
  - UI-031 (support, report and block). The session ended during the runner's independent check; `codex-run.mjs --finish` reran the check (pass) and committed Codex's work.
- Backends:
  - reviews (double-blind), saved helpers, the home;
  - notifications from the outbox (lazy dispatcher), preferences, privacy requests (migration 0015);
  - real unread badges in the signed-in shell.
- Tooling:
  - a machine-wide heavy-work lock shared by Claude's gate (`scripts/gate.mjs`) and the runner's independent check;
  - the shared e2e sign-in helper; the seed reset clears everything that points at seeded bookings.
- Flaky under load: a full gate run had 8 e2e failures while Codex ran its own checks. The failed specs passed when rerun alone. A helper form focus test also failed once; its fix goes to Codex with UI-018.

## 2026-11-11 — iteration 10 (disputes, invites, staff people, availability)
- Codex runs:
  - UI-025 (direct invites, 50 min), merged and wired: the request page, invites on My offers and on the task page, Book again, Invite helpers. Two contract requests declined (see decisions).
  - UI-020 (reward reviews and people, 42 min), merged and wired: `/admin/rewards`, `/admin/users`, `/admin/users/[userId]`. No contract requests; Codex replaced the notification placeholders.
  - UI-029 (availability posts) launched right after the UI-020 merge.
- Backends:
  - notifications for change requests and invites;
  - availability posts (migration 0020): slot holds through invites, the expiry job, open slots on the public profile;
  - invites waiting for a first authorization expire after 30 minutes; only live helper profiles can be requested.
- Seeds: the disputed dresser (support settles it in e2e), `tsk_nightstands` for the invite e2e, a welcome reward in review for Sam.
- Real failures the gate caught after UI-025: tests still expected the old profile link text and only `cancel_task` on open tasks; on phones, Cancel task moved under More.

## 2026-11-13 — landing seventh pass, installable app, one-tap offer (Claude, owner requests)
- Landing (UI-053): the skeleton town that grows into the 3D one; the 2D map's setup restyled before MapLibre and started after the build-up; the page's floating scrollbar (no white strip). Built with two helper agents.
- Plan 3.6: the web app manifest and icons; Chrome reports no installability errors.
- Plan 4.3 (UI-054): the one-tap offer on find work, with Undo; integration `quick-offer`, e2e `find-work`.
- The peer session finished its plan items (3.3, 3.4, 3.5, 4.4); one gate covered both (`scripts/gate.mjs`).
- Environment: the dev server grew to 31.8 GB over hours of tests (navigations timed out) and later served a stale SSR graph for edited client components (hydration failures); both fixed by a clean restart.

## 2026-11-13 — Post again (plan 4.2)
- A finished task opens the wizard on its review step with everything from last time (UI-055); the saved address is read again on "Post", and a deleted one (retention) is searched again. Integration `post-again`, e2e `post-again`.
- The completion plan is done (every item ☑). Next: the refinement pass across the screens, split with the other session.

## 2026-11-13 — Phase 2: regular visits, scheduled payments, the recurring-month reward
- Split of the remaining phase 2 items with the other session: regular visits (and the recurring-month reward), scheduled funding for far-ahead bookings, replacement matching, ranking by reliability and AI category suggestions here; passkeys, instant payouts, poster credits and Spanish UI there. Errands wait for counsel (F17, blocked.md).
- Gate at 99b76aa: check 2,363, test:db 301, build green; e2e 157 passed with one failure and one flake, both in find work: Undo was ignored while a hide was on its way (fixed: each task's latest choice is queued), and the one-tap offer test wasn't retry-safe (c1aeccd).
- Regular visits (migration 0040, e7650ea, ed37c2a): the series, `scheduled` bookings, the 48 h off-session charges with retries and the 12 h skip, skips, pauses, stops and ends, one conversation per series, six notifications, the jobs. Unit tests for the calendar (DST, monthly by weekday, the 5th weekday), integration `series` (the whole life of a weekly series).
- The recurring-month reward (94ca9ef), integration `recurring-reward`.
- Bookings more than 14 days ahead are booked now and charged 72 h before (87b4303), integration `scheduled-booking`.
- Next: the UI for all of it (once the other session's format codemod lands): Repeat on the proposal form, the schedule on the proposal page, the series page, the booking page's "Pay now" card and series link, the regular visits on the bookings page, the confirmation page's "charged later"; then e2e.

## 2026-11-13 — Phase 2, the rest: UI for regular visits, replacement matching, reliability, a suggested category
- UI (UI-059, UI-060; built by Claude with two helper agents): Repeat on proposals, `/app/series/[seriesId]`, the booking page's paid-later card and series link, regular visits on the bookings list, checkout for far-ahead bookings, "Reliable" on helper cards and offers, the recurring-month reward on the rewards page, "Describe what you need" on posting. 35 new or changed previews clean at 360 and 1280 (no runtime errors, no serious axe issues); e2e `series.spec`.
- Automated replacement matching (e05ec82), ranking by reliability (ab63b0c).
- From the other session: the Spanish UI (pages under `src/app/[locale]`, every namespace translated, emails and texts in the recipient's language, a catalog check), the account language, passkeys.
- Gate at dd7fa73: check and build green; test:db and e2e red from shared test data. A webhook test left outbox events for a deleted user, and the dispatcher threw on them (it now skips a gone recipient). My new tests reopened tasks into other tests' feeds and boards, and "Post again" e2e left open tasks behind. Fixed in 0744c19 (test:db 74/334, check 2,558, the affected e2e green). Before the move, a stale public task page after a decline ("3 offers"); it didn't reproduce on a fresh server, and the other session is checking.

## 2026-11-13 — Final gate before the move to a VPS
- The owner asked to finish before moving the project. A temporary dev server ran for one last full gate at 99b57a2: test:db 74 files / 334 tests and the build green; e2e 164 passed, 2 flaky, 1 failed. The check had one failure, `helper-forms` focus under load, which passes alone 9/9; the check rerun is green, 2,558.
- The e2e failure: admin-ops's hide-and-restore test lost a navigation (net::ERR_ABORTED) right after the public page's reload loop, and its retry found the task still hidden by the first try. The test now restores the patio task and clears the page cache at the start, and it opens staff pages again if a navigation is cut short. The spec passes on both projects.
- The dev server was stopped again afterwards, as the move needs.

## 2026-11-13 — The ID check in two stages: our own capture (plan 6.1)
- The owner's request (completion plan Part 6): a helper's ID check now starts with our own capture, reviewed by trust and safety, and the provider's hosted check follows as the double check (Stripe Identity until Persona, 6.2). Blueprint 06 §1, §3 and §4 and 08 describe it as a product decision of the owner's.
- Capture (built by Claude; `src/ui/screens/helper/identity-capture.tsx`): the Texas notice in its own step (draft-0.2), the kind of ID, the front and the back (camera with a card frame, or a file), a live selfie with an oval frame and a prompt the app picks (a keyed hash of the person and the try), the camera app where no camera opens, retakes, the review. Photos are shrunk in the browser, re-encoded on the server (no metadata) and encrypted at rest (`ByteCipher`, AES-256-GCM, a key derived from FIELD_ENCRYPTION_KEY). Table `identity_captures` (migration 0044), private file kinds `id_document` and `id_selfie`.
- Rules (`identityStanding`): captures count toward the same limits as provider sessions, one in review at a time, the reason after a rejection, under 18 closes setup until staff reopen it; the provider's step opens only after approval; helpers verified before stage 1 stay verified.
- The reading (`verification.read_documents`): Claude transcribes the front once (`id-document-reader.ts`, with the server-side fallback); the app keeps only the name match, 18 or older, not expired, the expiry month and year and the document's kind.
- Staff: the identity queue's "ID photos to compare"; on the person page, "Open the photos" (a logged reason, 5-minute links through the document route, decrypted there) and "Review" (approve, or reject with a reason; a note in the audit log). The photos are deleted 30 days after the decision, at once when canceled or the account is deleted.
- Also: the client ID page sends a helper who has reached the ID step to it; the done step's welcome reward now stays for helpers holding a founding number (since 0576be3 gives numbers out when a helper becomes bookable); the e2e reset clears Priya's captures.
- Checks: `npm run check` green; DB tests (`identity-capture` with the verification, tracks, address-reading and client-ID suites: 37 tests); 38 previews of the ID check and the states it changed at 360 and 1280 (axe clean); the onboarding e2e on app-desktop with Chromium's fake camera for the live selfie. The shared dev server restarted twice during the runs (a lost preview run and a cold, slow e2e attempt); reruns were clean.

## 2026-11-14 — Persona as the ID check's double check (plan 6.2)
- The owner's choice (completion plan 6.2): Persona is stage 2 of a helper's ID check and a client's risk-triggered check, built on its REST API without an SDK (`src/integrations/persona`): an inquiry from the template with a pinned API version and an idempotency key, opened through its one-time link; only our user id goes to Persona. The provider order is Persona (all three settings), then Stripe Identity, then the stand-in outside production; production needs one of the two (`.env.example`, docs/integration-points.md).
- Webhooks at `/api/webhooks/persona`, through the webhook inbox (deduped by the event's `data.id`, retried and replayed signed again in Persona's `t=…,v1=…` format; `src/modules/webhooks/dispatch.ts` gained the provider, and /admin/webhooks lists it). The signature accepts any of the space-separated sets in constant time within 5 minutes. Events apply by their creation time (`provider_event_at`, migration 0046): late or repeated ones change nothing, a verified result is final, a progress update never undoes a decline; Persona's outcome is kept for staff.
- The mismatch case: when the double check declines or fails an ID our team approved, the helper's ID step pauses (`double_check_review`, with a note and a support link) and the identity queue gets a case with both results; staff let them try again or turn the photos down (`double_check_failed`), with a note in the audit log beside both results, and the helper is notified on the identity track.
- Our ID photos are deleted once both stages are final (the timers, as soon as the ID is cleared); the 30-day rule stays as the backstop. Deleting an account now deletes its proofs of address and ID photos at once (in review: withdrawn or canceled first), and deleted accounts leave the identity queue.
- Copy: Persona replaces Stripe in the ID wording (en and es); the Texas notice is draft-0.3, so it's accepted again. Background adjudication (approving after review, the pre-adverse and final notices) is now trust and safety's alone, as blueprint 08's matrix says (support leads and admins are refused).
- Blueprint 06 (§1 stage 2 and the mismatch rule, §3 redaction, §4 dashboards, F10 and F15) and 08 (the identity tables and retention) describe it.

## 2026-11-14 — The ID check's extras: the same ID twice, expiry, a name change (plan 6.3)
- The same ID on two accounts: the one reading also transcribes the document number (in memory only); the capture keeps a keyed hash of the normalized number, state and birth date (`document-hash.ts`, its own HKDF label from FIELD_ENCRYPTION_KEY; migration 0050). A match with another account flags the capture, holds the double check (`duplicate_id`) and opens a case in the identity queue naming the other accounts; staff find it in order (the hold lifts) or turn the photos down. The hash goes with a deleted account unless it was banned.
- An ID running out: a verification counts until the end of its ID's expiry month in Austin. 30 days before, the verification timers ask for a new check (`id_expiring` request row) and notify the helper (`id_expiring`); they stay bookable, with the badge, until the month ends, and the ID step shows the date. Then they're told once more and can't be booked until the new check passes. A renewal that turns something up for staff pauses them at once.
- A legal-name change from the account page asks a verified helper for a new check (`name_changed`), which stops counting the old one at once.
- Copy (en, es): the capture's privacy note and the privacy policy mention the one-way code; the hold, the renewal and the expired notes; the new notification; staff copy for the case and its two decisions.
- Blueprint 06 §1 (the extras) and 08 (the columns, the hash's retention) describe it.

## 2026-11-14 — The last scenario rows: webhook ordering, chargebacks, payout failure, reward budgets (plan 5.9)
- T-06 (`webhook-ordering`): signed Stripe events through the webhook inbox, its dispatch and the payment handlers, in every order, against a fake Stripe. Fixed: the webhook and the client's return from the bank finishing a payment at once confirmed the booking two or three times (a saved card, a message and a confirmation each); `settle` now locks the payment row and a second finisher finds it settled. A client whose webhook got there first was told the booking failed (now "booked"), and one whose bank declined was told "not allowed" (now the decline). A late failure never undoes a success.
- T-18 (`chargebacks`): while a chargeback is open, the booking's earnings not transferred yet wait (the transfers job skips them; the earnings page shows them on hold); they go out once the dispute closes. A lost chargeback is the platform's loss in a new ledger (`ledger_journals`, `ledger_entries`, migration 0051, a deferred trigger that refuses unbalanced journals): `chargeback_loss`, the disputed amount and Stripe's fee, once per dispute. Finance and admins download the evidence pack at `/api/admin/bookings/[bookingId]/evidence-pack` (JSON: the dispute, terms, check-in, completion with photo links, approval, the people's steps, the conversation, the review, refunds, the ledger; no exact address), audited; the chargeback case's note says where.
- T-19 (`payout-failure`): proven on the earnings page's data. Fixed: "Action needed" stayed forever after one failed payout (now while the latest payout is a failed one); a payout that failed after it was paid kept its earnings "paid out" (now they go back to the next payout); a late payout event moved a paid payout back (payouts now only move forward, and are dated by Stripe's creation time).
- T-26 (`reward-budget`): the program budget (`REWARD_BUDGETS`, now in `rewards/domain.ts`) was only shown to staff; 50 helpers qualifying at once got 50 grants against a budget for 10. A grant is now created in a transaction behind two advisory locks (the helper's monthly cap, then the program's budget), so exactly 10. The founding numbers' lock is proven the same way (exactly 91 to 100 for 50 helpers at once).
- T-29: web push was built in plan 3.5 and is covered by the `push` integration tests with a stand-in push service; a real browser's push service isn't exercised.

## 2026-11-14 — Payment follow-ups from the scenario suite (plan 5.17)
- A change's difference, an invite's hold and a rebooking proposal now settle once, whichever side finishes them (tests in `webhook-ordering`, run against the code before the fix first). A change's payment row is locked and the change applied in the same transaction (before, the webhook and the client together wrote the terms twice: a unique violation or a refund request for a good payment). An invite's first hold leaves `authorizing` only for the first answer and a counter's new hold is claimed by the first finisher (before, three deliveries sent the helper three invites, and a client back after the webhook was refused). A client who comes back after the webhook gets the settled answer.
- A rebooking proposal whose payment only Stripe's webhook finished stayed "sent": the webhook now runs the same acceptance (`proposalFunded`: accepted, the helper told, regular visits started), and a client back afterwards is told "booked".
- Staff Exceptions list a failed payout only while it's the helper's latest payout (`staff-payments`); the Payouts tab keeps the history.
- "Action needed" clears when Stripe reports a working default bank (`account.external_account.created` or `.updated`, through the inbox and the Connect handler; `payout_accounts.bank_updated_at`, migration 0053), not only at the next payout (`payout-failure`). A disabled (`errored`) bank or an extra account that isn't the default changes nothing.

## 2026-11-14 — UI pass, batch 1: the public pages (plan 5.10)
- Task board (`/tasks/austin`): on phones each filter group (category, when) is one row that scrolls sideways on its own, with faded ends and the picked chip kept in view (`SideScrollList`, src/ui/components/layout); Sort sits beside its label, its chips wrapping under it when a language runs long. The filter card went from about 640 px to about 330 px tall at 360, so the first tasks show on the first screen. From `sm` up the chips wrap as before; the filters are still plain links.
- How it works: an icon per step with a "Step N" label, and at `lg` two columns: the steps, and beside them (sticky) the three promises as cards (when you pay, your address, ID-checked helpers) from the shared copy; on phones they follow the steps. The call to action lines up with the step text.
- Pricing: the "you pay when you book" note is sized to its line; paired examples (fixed, hourly, expenses) are the same height; the closing two points (approval window, direct invites) put their icon beside the heading.
- `scripts/ui-audit.mjs`: every preview (or `--filter`) at 360 and 1280 for tap targets under 24 px (WCAG 2.5.8), clipped text, content past the viewport and sideways pages, with under-44 px notes; a fresh page every 25 previews. Batch 1's previews: no failures in English or Spanish.

## 2026-11-14 — UI pass, batches 2 and 3: the task page, posting, the booking page (plan 5.10)
- Public task page: at `lg` two columns: the task and who posted it on the left; the summary (where, when, budget, offers) and the offer on the right, the offer staying in view. Phones keep the same order.
- Posting wizard: the intro only on the first step, the draft note in the header in small type, each step's legend visually hidden (the progress line already names the step; the fieldset keeps its name). On phones each step's form starts about 150 px higher.
- Booking page: the area line no longer says "the exact address is private" when the exact address is shown on the same page (exactly when `ExactAddressPanel` renders; every other view keeps the note and the lock explanation). The address panel's actions stack full width on phones. The compact helper card (booking confirm and booking pages) leaves out the services price list: the agreed price is what counts there (UI-003 updated).
- `scripts/ui-audit.mjs` counts tap targets as WCAG 2.5.8 does (with labels and the spacing exception), as the keyboard spec does.
- Checks: posting, a11y-keyboard, post-again, tasks-public, booking-page, booking, address-privacy and admin on the e2e build (35 passed, 15 one-viewport skips, 2 load flakes that passed on retry); jsdom 559 passed; screenshots at 360 and 1280 in English and Spanish.

## 2026-11-14 — UI pass, batch 4: messages and the account page (plan 5.10)
- Message composer: Send sits beside the message (on phones a round icon button, still named "Send"); the hint, the counter and, on wide screens, the Enter-to-send hint sit under it; Attach photos follows. The composer lost its separate Send row (about 60 px on phones). Masked contact details in the thread are unchanged.
- Account, contact details: the email or phone sits on its own line across the row, with what it is and its button on the line above, so an email address is no longer broken inside the word on phones. Placed by the grid, so screen readers still read the label, the value, then the button.
- `scripts/ui-audit.mjs` opens a fresh page every 10 previews (measured: a long-lived page grew Chrome's renderer to 2.2 GB).
- Checks: messaging, support, notification-delivery, account, account-contact, passkeys and helper-standing on the e2e build (20 passed, 13 one-viewport skips, 1 flake on a notification preference's saved message that passed on retry); jsdom for messages and account (195); ui-audit on the thread, inbox and account previews: no failures; screenshots in English and Spanish.

## 2026-11-14 — UI pass, batch 5: the admin queues (plan 5.10)
- Cases list: on phones the queue and status filters are each one row that scrolls sideways (`SideScrollList`), so the first cases show sooner; the on-call's text from 5.12 opens these pages on a phone. Admin filter chips never wrap inside their label.
- Case page: the response target in the header has its label ("Response target"), as in the list.
- Checks: admin, admin-ops, admin-people, admin-metrics, admin-webhooks, staff-controls, refund-approval and support-tools on the e2e build (24 passed, 14 one-viewport skips); jsdom for admin screens (175); ui-audit over the 164 admin and staff previews (verification screens left to 5.18): only the bookings list's name links, 20 px tall on wide screens (fixed in the next batch).

## 2026-11-14 — UI pass, batch 6: what the full audit found (plan 5.10)
- A ui-audit sweep of all 1,106 previews at 360 and 1280 in English and Spanish (e2e build): 2 failures in English and 9 in Spanish. Of these, the landing hero's prompt label clipped by 2 px in Spanish went to the landing session (fixed there). The rest are fixed here.
- Find work list: a task title is an inline link 19 px tall on phones, crowding its neighbors; 3 px of padding makes its target about 25 px without moving text. Bookings (staff): the client and helper name links are at least 24 px tall on wide screens (they were 20 px and 2 px apart).
- `scripts/ui-audit.mjs` measures a link stretched over its card by an absolute `::after` as the card (My offers' "closed" cards were a false positive).
- Checks: find-work, invites and a11y-phone on the e2e build (11 passed, 9 one-viewport skips); ui-audit over find work, my offers and staff bookings in English and Spanish: no failures.
- Fix to batch 5 (found by d1): the case page's response-target label used `adminCases.response`, but the key is `adminCases.columns.response`, so every staff case page showed the key and logged MISSING_MESSAGE. The jsdom test for the case page now asserts the label, and its intl provider throws on any missing message. A grep of batches 2–6's e2e server logs found no other missing messages.

## 2026-11-14 — UI pass, batch 7: the remaining screens (plan 5.10)
- A screenshot review of the screens not yet covered (my tasks, bookings, earnings, payments, availability, notifications, reviews, support, sign-in as changed today, browsing and saved helpers, the public helper profile, help): only two clear problems, fixed here.
- Bookings: on phones the three tabs size to their labels (they were equal thirds, so "Upcoming (1)" broke before its count); English fits on one line, and Spanish wraps evenly.
- Support, new request: the topics are bordered rows with a normal radio, as in the booking sheets (they had 44 px empty circles beside the text).
- Left as they are, on purpose: the default card's disabled "Make default" on Payments (a test asserts it); the helper profile editor (in the gift-card rework).
- Checks: booking-page, support, a11y-phone, sign-in and social-sign-in on the e2e build (40 passed, 6 one-viewport skips), with no missing or misformatted messages in the server log; jsdom 83; ui-audit over bookings, support and sign-in in English and Spanish: no failures.

## 2026-11-14 — UI pass, batch 8: three calls on the open points (plan 5.10)
- Payments: the default card has no "Make default" (its "Default" badge says so); when another card becomes the default, focus moves to that card.
- Bookings (Spanish): the "Requieren acción" tab is "Pendientes" (the term the Spanish copy uses for that state), so the three tabs fit on one line at 360. English unchanged.
- Admin home: `QueueSummary.urgentCount` counts the open urgent cases in each queue (a safety report opens one); a queue with any has a stronger edge and an "N urgent" badge (words and an icon, not color alone). The client message map regenerated for the new key.
- Checks: booking-sheets (a safety report, then staff see the urgent badge on their home), admin, spanish and a11y-phone on the e2e build (18 passed, 10 one-viewport skips, no copy errors); staff-cases integration (7, with the urgent count, and back to 0 once resolved); jsdom 111; ui-audit over the admin home, payments and bookings: no failures. The type check's two errors are in other sessions' uncommitted files (src/i18n/client-messages.tsx, tests/integration/demo-data.test.ts).

## 2026-11-14 — Spanish copy review, part 1 (plan 5.20)
- An analysis of every Spanish string against its English (4,529 user-facing pairs: the UI namespaces except staff tools, plus the emails and texts) found the terms already consistent (reserva, ayudante, tarea, oferta, cliente, tarifa de servicio, reembolso, reseña, iniciar sesión, soporte, visitas regulares) and the voice informal throughout. No missing ¿ or ¡, no untranslated strings, no calques. The glossary is now `docs/ui/spanish-glossary.md`.
- Fixed: booking statuses agree with "la reserva" (Reservada, Completada, Cancelada; an accepted offer or request is "Reservada"); booking terms are "condiciones" everywhere ("Condiciones y dinero", "Sugerir otras condiciones", "condiciones de cancelación"), and "términos" is kept for legal documents; the late cancellation fee is "cargo"; "Voy en camino" and "Llegaré tarde" join "Ya llegué" as first-person day-of actions; a completed regular visit is "Completada"; "se cobra a tu tarjeta" replaces "tu tarjeta se cobra"; a time in copy is written "8 a.m.", as the formatter writes it.
- Emails and notifications: "Tu reserva está confirmada" replaces "Ya está reservado"; "Tu domicilio está verificado"; "{actorName} terminó {title} y espera tu aprobación"; "Gana dinero a tu propio ritmo", as elsewhere.
- Sent to the landing and shell session: "reservar" used for claiming a gift-card spot (gone with its rework) and "Términos de recompensas" (now aligned).
- Checks: i18n:check on each namespace changed, the catalog test, spanish and a11y-phone on the e2e build (11 passed; it throws on copy errors, none), ui-audit in Spanish over the booking, bookings, series, home, how it works and my tasks previews: no failures.

## 2026-11-14 — The help center and emails against today's product (plan 5.21)
- Help center, English and Spanish, each claim checked against the code or decisions.md:
  - Getting verified: the six steps (phone and home address were missing), when offers open, and the ID facts: one ID per account, photos deleted once both checks are final (30 days at most), and the check counting until the ID's expiry month ends, with a reminder 30 days before.
  - When do I get paid: tips are all yours, and what makes a payment wait (a reported problem, a bank dispute, a failed payout with "Action needed" clearing once the bank works).
  - When am I charged: bookings more than 14 days ahead (charged 3 days before), regular visits (2 days before), and the outage pause.
  - Canceling: a cancellation by our support team is a full refund. Staying safe: the safety report reaching the safety team at any hour, blocking and reporting. Reporting a problem: before you approve, and the helper's offer to fix it. Who sees my address: support opens it only when needed, logged.
- Emails and texts: one shared layout with the new icon; plain-text versions present and matching; links through the route contract; no exact address or contact details. Fixed the gift card email: its html now says its language, a missing first name leaves no English stand-in ("there"), and a welcome card (which can come before any task) welcomes rather than thanks. New unit test `src/modules/rewards/emails.test.ts`.
- For the owner: the "your email or phone changed, not you?" notices send people to /app/support, which needs a sign-in the person may have lost. There is no public support route or address yet.
- Checks: email, content and catalog unit tests (128), i18n:check server, email and spanish on the e2e build (9 passed, no copy errors).
- Spanish follow-up (from the SEO study): Spanish category pages, the public task page's breadcrumb and label, and the posting wizard's category step show the translated category name by slug, not the database's English one ("Armado de muebles en Austin", not "Furniture assembly en Austin"). The public task board's heading and intro say "Trabajos disponibles en {market}" (matching its page title): search and acquisition headings use "trabajo(s)", while the product keeps "tarea" (glossary section, decisions row). Checks: public-pages, posting and spanish on the e2e build (30 passed, no copy errors); jsdom 154.

## 2026-11-14 — Support for people who aren't signed in (plan 5.22)

`/help/contact`: a contact form on the help center for someone who can't sign in or has no account (email, topic, message), bot-checked as sign-up is, and limited per address and per IP. It opens a case keyed by the address, with no member on it (migration 0057). Staff find it in the requests queue by address ("Contact form, not signed in"), see whether an account uses it (staff only), and answer by email in the visitor's language, with a standing warning not to share account details. The help center's support card and the account-deleted notice now link to the form; the email and phone change notices are 5.23's (d1), which links there too.
- Checks: tsc (whole tree), lint, unit tests for content, admin, support, i18n, accounts and privacy (345), test:db for public support, support, staff cases and support tools (22, 7 new), `tests/e2e/public-support.spec.ts` on the e2e build (4 passed: the form and its confirmation on phones and desktop, a Spanish visitor answered by staff in Spanish; no copy errors).

## 2026-11-14 — The Craigslist-style task board (plan 7.4–7.5, tasksnearme-d4)

The public board `/[market]/tasks` (and b7's category hubs, the same screen with their own heading): dense rows grouped by neighborhood with each one's count and "See all N in X" (or by day, one paged list, or cards); a filter column, a "Filters" button on phones, where every option is a link with its count (keyword, category and task type, neighborhoods, price presets and a range, fixed or hourly, when, time of day, posted within, remote only, 0–1 offers); the filters in use as chips; the market's open and posted-today counts in the header. Task types (7.5) on every row.
- Commits: b1f4a07 (data: facets, sections, stats, `loadTaskBoard`), 2af6378 (screen, copy, previews, tests), e44c9aa (realtime.spec independent of my-tasks.spec, which declines off_lee first in CI shard 3).
- Checks: tsc (whole tree), lint, unit tests (board screen 12, copy, fixtures, contracts: 296), board and posting e2e on both projects on the e2e build, my-tasks then realtime in one worker; board previews at 360 and 1280 in en and es with axe and no sideways scroll (the "New" badge's contrast and an sr-only label escaping the scrolling controls were fixed).
- Decision: two columns, no rail or preview pane (decisions.md).

## 2026-11-14 — The live board and the community feed (plan 7.6–7.8, 7.11, tasksnearme-d4)

- 7.6 (49f682f): the board listens to its market's public stream; a posted task that fits the board's own filters (src/shared/board-match.ts, the SQL's rules as functions) becomes "N new tasks · Show" above the list. Nothing moves under the reader; no viewer counts. Board links keep /es (LocaleLink) and forms too.
- 7.7–7.8 (migration 0058 f1494dc; service 0d12721; screens 44ca351; Spanish 75782e1): /app/community. Ask for a recommendation, ask a question, share a tip, thank a booked helper; near you (neighborhoods within 3 miles plus market-wide posts) or the whole market; active, new, top this month; one level of replies; Thanks and Helpful; pinned answers; a recommendation's answer names one helper (booked, saved, or a marked self-tag), shown as a card with "Recommended by N neighbors" (people who booked them). Masked like messages; crime and suspicious-person posts turned away; new accounts limited; blocks both ways; report a post or reply; staff hide, remove or restore with a reason (audit log). Live: new posts as a pill, replies on an open post without a reload (market channel, ids only; the signed-in stream forwards community notices only). Notifications (with d1): replies, pinned answers, Helpful at 1, 5 and 25, under a new Community topic (in the app and on devices; email and texts off by default). Community in the desktop nav and the account menu (83's layout).
- 7.11 (4cb6d25): the demo marketplace gains 120 community posts, 157 replies and 749 reactions in its 15 markets, from real completed demo bookings; replaced on every run.
- Also: board test fixes for CI's shared DB (62c0230 snapshot, bbdd997 every page), realtime.spec independent of my-tasks.spec (e44c9aa).
- Checks: npm run check (3161 tests), the whole DB suite on a scratch DB (100 files, 503 tests), e2e community.spec (two browsers), board.spec with the live test, realtime, account, posting; previews at 360 and 1280 in en and es with axe.

## 2026-11-14 — Chat, questions, saved searches, response times (plan 7.3–7.12, tasksnearme-d4)

- 7.3 (29d74a4): on wide screens the conversation list sits beside the open conversation; the inbox filters (all, unread, offers, bookings) and searches as you type; messages from one person within five minutes group; "New messages" marks where the unread began and stays put. Reactions, quote-reply and saved replies follow (migration 0059).
- 7.9 (29d74a4, 022c961): verified helpers ask on an open task (one open question each, masked); the poster answers, edits and pins; reports and staff moderation; notifications question_received / question_answered.
- 7.8 (29d74a4): "Recommended by N neighbors" on helper cards and profiles.
- 7.12 (29d74a4): response times as ranges (within an hour, a few hours, a day), recomputed when a helper sends a message (median first reply over 30 days, at least three).
- 7.10 (00c1a44, 083a3cd): "Save this search" on the board; /app/saved-searches with alerts right away (matched with the board's rules, at most 10 a day, never the poster or across a block) or a morning digest (a job at 8 am); nav and the phone menu.
- 7.4b (00c1a44, 083a3cd): find work applies every board filter, and its sheet offers them.
- Checks: npm run check, test:db for questions, searches, notifications, response time, board and find work; e2e questions, saved-searches, community, messaging, realtime, find-work, board, posting, account, my-tasks; previews with axe.

## 2026-11-14 — Reactions, quote-replies and saved replies; a live board; Part 7's data in privacy (plan 7.3, 7.6, 7.11, tasksnearme-d4)

- 7.3 (migration 0059 a48b3ad, fce87ae): reply to a message by quoting it (the quote shows above yours); react with one of four reactions (participants only, one each, live); saved replies with `{first_name}` and `{task}` filled in, kept per person (at most 20), masked like any message. The chat part of the plan is done.
- 7.11 (25857cc): open demo tasks in every market get questions from demo helpers, most answered, some pinned.
- Privacy (1bb8f26): the copy of your data includes your community posts and replies, questions and answers, saved searches and saved replies; deleting an account removes its posts, replies and questions (reason `account_deleted`), its reactions (counts recomputed), saved searches and saved replies.
- 7.6b (9b3b65e, c337c0e): the board's rows are live. An offer made, withdrawn or declined, a booking, a cancellation or a reopening sends the task's id to its market's public stream, which reads the count and state once per notice for all its streams (`task-state`); the row's count changes in place, or says "Booked" or "No longer taking offers". "New" means posted since your last visit to that market's board (remembered in the browser only; decisions.md), with "since your last visit, 3 hours ago" beside the market's counts. A community post marks the replies since your last look at it, never your own ("2 new since your last visit" beside the count), Reddit-style.
- 7.5b (78dc82e): on a category's board and b7's hub pages, the task types as tiles above the list, busiest first, each with what its open tasks offer (the middle half of their budgets) and how many are open, linking to that type (decisions.md). 7.2, 7.4 and 7.7 marked done: everything in their rows is built (7.4 without the preview pane, by decision; community reports reach staff as cases with links to the post, reply or question).
- 7.5c (78d6a53, b7's note): the tiles' budgets come from real tasks only, so before launch they show types and counts without prices; never on b7's category pages or cost guides.
- 7.7b (357b67f): the community feed is continuous, LinkedIn-style. Older posts are added as you reach the end (three pages by themselves, then "Show more posts"), each post once, then "You're all caught up"; without JavaScript, "Show more posts" is the next page's link. e2e seeds 25 old posts, scrolls to the end in a browser, and removes them.
- Final sweep at 3ecd71c: the whole DB suite (105 files, 519 tests) and the whole e2e suite on both projects (227 passed, 0 failed) on the e2e build.
- 7.11b (d91f4b7): busier demo markets talk more: Austin 22 posts (past one page), Chicago 15, small markets about 8; 157 posts and 212 replies.
- Fixes: a11y-keyboard.spec looks for the sent message in the conversation, not in the list beside it (7.3's two panes); the board's live test cancels the task it posts, which had pushed the seeded desk task off the home page's four newest (tasks-public.spec).
- Checks: npm run check (3196 tests), the whole DB suite on a scratch DB (105 files, 518 tests) and realtime again with the board notices, the whole e2e suite on both projects before 7.6b (224 passed; the two failures above, fixed), then board, a11y-keyboard, tasks-public, realtime and find-work on the e2e build; community.spec for the replies; for the tiles, test:db board and find work, board, saved-searches and tasks-public e2e on both projects, and the board previews at 360 and 1280 in en and es with axe and no sideways scroll.

## 2026-11-17 — "Not you?": recovering from an email or phone change you didn't make (plan 5.23, tasksnearme-9c)

- Migration 0060 (65bd055): `contact_change_reverts` (one row per change: the link's expiry and single use, and what the change replaced) and `users.contact_hold_at`.
- The link (c09a3cf, 3681f82): the email change notice to the old address, and for a phone change the text to the old number and the email to the account, carry "This wasn't me" → `/account/not-me?token=<row id>.<HMAC>`. Used once within 7 days, without a sign-in: every device is signed out, the change is undone unless a newer one replaced it, passkeys and Google or Microsoft links added from a day before the change are removed, the account's email, phone and ways to sign in are held, and an urgent account case opens for trust and safety (paged), with a staff-only note of what happened and what else changed that week. 10 tries an hour per IP, 5 per link; used, expired, forged and unknown links look the same. The values are cleared on use and by the hourly sweep once expired; account deletion removes the rows (and, newly, passkeys).
- The hold refuses email and phone changes (also sign-in's phone step), new passkeys and Google or Microsoft links (also linking at sign-in, through Better Auth's account hook). Signing in with an emailed code and removing a way in still work. Trust and safety and admins clear it on the person page with a reason (audited), never on their own account.
- UI (2091fb4, by Claude, Codex not running): the page asks first, then says what happens next and links to /help/contact; the account page says why changes are paused; the person page shows the hold and "Clear the hold". en and es.
- Checks: the whole unit suite (276 files, 3242 tests) with the token, the notices and the security sweep; the flow against the database (12 cases) and the neighboring DB files (contact change, on-call, staff controls, privacy: 6 files, 42 tests); jsdom for the page and the account page; the new previews with axe at 360 and 1280 in en and es; e2e on the e2e build (the new spec, account-contact, staff-controls, passkeys, social-sign-in: 11 passed). The new unit, jsdom and DB tests were also run against the code before 5.23 (65bd055) and fail there.

## 2026-11-17 — Dates in each market's own time zone (plan 8.1, tasksnearme-8c)

Every date is shown, and every day line drawn, on the clock of the market it belongs to, so a market outside Central time can open (Gainesville, Eastern, is the first city).
- Core (4d52070, 67d5355): the date helpers take the market's IANA zone (`markets.time_zone`); `marketDayKey`, `marketClockTime` and `marketLocalToUtc` require it. `src/modules/markets/time-zone.ts` reads each market's zone once per process (and a person's, from their home market).
- Pages (92b1e4a): `getViewer` sets the signed-in person's zone as the request's default (`src/shared/format/request-zone.ts`; layouts and pages render in parallel, so nothing is passed down); a page about one market wraps its screen in `MarketTime` (board, category, cost guide, market page, public task, helper profile), which wins; client components read `TimeZoneProvider` (the signed-in and staff shells, and `MarketTime`). `useFormat()` gives `dayKey`, `timeZone` and `zoneName`. "Austin time" hints name the zone in the reader's language ("Eastern Time", "hora oriental").
- Domain: quiet hours on the recipient's clock and notification times on the booking's (dae5187, 8922f67); the $75 cap on the helper's month, recurring visits on the series' market month, program budgets and staff metrics on one reporting zone (c6151d2); ID dates on the holder's calendar (36c77ab); the board's today, weekend and times of day, saved-search alerts, the 8 am digest per market (6880dd6); posting, offers and find work (1bc6fc2); regular visits and rebooking (45aa5e2); availability, home, payout dates, the assistant, the audit filter (21d320b); seeds (8970445); tests name their zone (5b1c582).
- Opening (da69b07): `marketStatusChange` allows live and pre-launch in the US zones (Eastern through Hawaii); other zones stay refused with `fieldErrors.timeZone: ['not_supported']`; pausing works anywhere.
- Checks: tsc; the whole unit suite (3324); test:db for every touched module (rewards and metrics, verification, board, searches, find work, tasks, offers, posting, series, rebook, availability, earnings, home, notifications, national); the whole e2e suite on the e2e build after the screens (229 passed; 3 failures outside 8.1, since fixed by 37 and f7).
- Left for the owner: CLAUDE.md's convention line ("displayed in America/Chicago") becomes "displayed in the market's own time zone"; the coordinator asks. The default market, and `MARKET_TIME_ZONE` with it, move to Gainesville in one step with tasksnearme-37.
