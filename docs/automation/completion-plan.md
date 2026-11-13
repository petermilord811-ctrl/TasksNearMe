# Completion plan (2026-11-12)

The owner asked for a plan to finish the project, and then for all of it to be built without questions:
1. "KYC and background check logic, phone verify with address verification with proof of address document";
2. "absolutely complete the whole project logic";
3. "think about good features and implement";
4. "map integration, a more ideal and more useful way";
5. "make the task list very comfortable".

Claude builds everything, including the UI, while Codex is at its limit (until 2026-11-17; decisions.md). Each part below ends with green checks and a local commit. Nothing is pushed. Decisions go to `decisions.md`, and product changes go to the blueprint (said so in each commit).

Status legend: ☐ to do · ◐ in progress · ☑ done.

## Part 1 — Verification, start to finish ("KYC")

The blueprint's three tracks (identity, work eligibility, payouts) become five steps a helper finishes before sending offers. The new ones are a verified phone and a verified home address with a proof-of-address document.

**New onboarding order:** profile → services → area → **phone** → ID → **home address** → payouts → background check (in-home categories only) → done.

**Bookable** (can send offers) means all of these:
- the helper agreement is accepted;
- the phone is verified;
- the ID is verified, and the ID name matches the account name or staff confirmed it;
- the home address is verified;
- payouts are active;
- for in-home categories, a background check that's clear (or that staff approved) and current.

| # | Piece | What it includes |
|---|---|---|
| 1.1 ☑ | Data model (migration 0029) | `agreements` (blueprint 08: helper agreement, biometric consent, background-check disclosure, with IP and browser); `address_verifications` (encrypted address, nearest area, document type, private document file, status, reviewer, reason, document deletion date); `identity_verifications` gains name match, attempt bookkeeping, a re-check reason and redaction dates; `background_checks` gains adjudication (engaged, pre-adverse, post-adverse), the invitation's expiry and the reminder dates |
| 1.2 ☑ | Rules (pure functions, unit-tested) | The step order and locks, what's bookable, ID attempt limits (3 a day, 5 in all, then staff review), under-18 closes helper onboarding, name matching, address standing (a new proof in review doesn't undo an earlier verified one), background renewal (from 30 days before expiry), adjudication |
| 1.3 ☑ | Phone step | The existing texted-code flow inside onboarding; done automatically when the account already has a verified phone |
| 1.4 ☑ | ID step | Texas biometric notice and consent before the check opens (CUBI); attempts; "checking your name"; ineligible under 18; staff can ask for a new check; changing your legal name after verifying asks for a new one |
| 1.5 ☑ | Home address step | Address search (Mapbox, confirmed like posting), unit, document type, one photo or PDF up to 10 MB, and the declaration that it shows the person's name and address and is dated within 90 days. Then in review, verified, or "needs another document" (with the reason) |
| 1.6 ☑ | Background step | The disclosure summary and acknowledgment before Checkr; the invitation's 7-day expiry; clear for 12 months with renewal; "under review" (no details ever); pre-adverse and final adverse action; suspended ("Checkr needs more information") |
| 1.7 ☑ | Staff | A Verification queue on `/admin`, `/admin/verifications` (address proofs, name checks, ID reviews, background reviews), and a Verification section on the person page. Viewing a document needs a reason, is logged, and opens a 5-minute link. Staff can approve or reject a proof, confirm a name, allow more ID tries, ask for a new check, and adjudicate a background check |
| 1.8 ☑ | Timers (job runner) | Delete proof documents 30 days after the decision; ask the provider to redact ID images 30 days after a final ID result; expire stale ID sessions (48 h) and background invitations (7 days); background renewal reminders at 30 and 7 days, and pausing in-home work at expiry |
| 1.9 ☑ | Notifications | Verified, needs your action, background check expiring, "you can send offers now" |
| 1.10 ☑ | Where people see it | The profile editor, the account page's verification section, and a public "Address verified · Nov 2026" badge (never the address) beside ID verified and background checked |
| 1.11 ☑ | Tests | Unit tests for the rules; integration tests for every track, the staff decisions, the timers and the privacy of documents; e2e for onboarding start to finish and the staff review |

Privacy: the document is the only verification data that enters our storage. It's private (the owner can't download it again, and staff see it only with a logged reason), images are re-encoded without metadata, PDFs are checked to be PDFs and served sandboxed, and it's deleted 30 days after the decision. ID images, birth dates, SSNs and background reports still never enter our database.

## Part 2 — A comfortable task list, and maps where they help

| # | Piece | What it includes |
|---|---|---|
| 2.1 ☑ | Find work, redesigned | A compact sticky filter bar (chips that scroll on phones, the rest in a "Filters" sheet), sorts (soonest, newest, nearest, highest budget), days as sticky groups ("Today", "Tomorrow", "This weekend"), dense rows (budget and "you'd earn", distance band, time window, offers so far, a "New" mark, how long ago), and save / hide on each row |
| 2.2 ☑ | List and map | On phones a list/map switch; on wide screens the list beside a sticky map. Each task is its general-area circle (never an address); nearby tasks group with a count; the helper's service area is drawn; hovering a row lights its circle and the other way round; tapping a circle shows the task card |
| 2.3 ☑ | Saved and hidden tasks | "Save for later" and "Not interested" for helpers, with a Saved filter |
| 2.4 ☑ | Maps elsewhere | The task page (helper and poster): the general-area circle and how far it is from the helper's area. Posting: a preview of exactly what helpers will see. The helper's area step: the service area drawn live as the radius changes. The booking page for the booked helper: Directions buttons (Google Maps, Apple Maps) built from the address text, never from stored coordinates. The public task board gets a map view too |
| 2.5 ☑ | Poster's lists | My tasks and bookings: what needs attention first, grouped by day, offer counts and the newest offer on each task |

Maps stay free: MapLibre with OpenFreeMap tiles, and the static fallback when WebGL is missing. Mapbox is used only for address search (its terms: no stored coordinates).

## Part 3 — Finish the logic the blueprint still asks for

| # | Piece | Why |
|---|---|---|
| 3.1 ☑ | Task alerts for helpers | Blueprint J1: matching helpers (category, service area, alert settings) get an alert, rate-limited. A "New tasks near you" topic, at most 3 an hour and 10 a day per helper |
| 3.2 ☑ | Staff two-step sign-in with an authenticator app (TOTP) | The admin check still uses the development code 123456 (a TODO). Free, no provider |
| 3.3 ☑ | Data export and account deletion | The account page records the requests; build the export (a download for the person) and the deletion (anonymize once nothing is open), per blueprint 08 §5 |
| 3.4 ☑ | Retention timers | Blueprint 08 §5: exact addresses deleted 180 days after the last booking unless saved, and the rest of the table where a timer is missing |
| 3.5 ☑ | Web push (the third channel) | Finishes T-29: a service worker, VAPID keys generated locally, a subscription per device, asked only after a related action (posting a task; finishing onboarding), and the account page's "Notifications on this device" |
| 3.6 ☑ | Installable app | A web app manifest and icons, so phones can add TasksNearMe to the home screen (with push) |

## Part 4 — Good features

| # | Feature | Why it's worth it |
|---|---|---|
| 4.1 ☑ | Automatic reading of proof-of-address documents | With `ANTHROPIC_API_KEY`, Claude reads the document once and tells staff whether the name, address and date match. Staff still decide; only the yes/no answers are kept. Stand-in in tests |
| 4.2 ☑ | "Post again" | Posters repeat a past task in two taps (the same category, details and address) |
| 4.3 ☑ | One-tap offer at the posted budget | For fixed-price tasks, helpers offer the asked price straight from the list |
| 4.4 ☑ | Provider adapters for Stripe Identity and Checkr | Written against their APIs with tested webhooks, so adding the keys switches the stand-ins off |

## Order of work

Part 1 first (1.1 → 1.11, about four commits), then 2.1–2.3 (the list and map), 3.1 (alerts, which use the same matching), 2.4–2.5, 3.2–3.4, 4.1, 3.5–3.6, 4.2–4.4. Anything that turns out to need the owner goes to `blocked.md`, with the workaround, and the work continues.

## Part 5 — Before launch (2026-11-13)

Parts 1–4 and phase 2 are built, apart from multi-helper bookings and errands (decisions.md, blocked.md). This part covers the launch-hardening items from blueprint 11 (E7) that don't need the owner. After the move to the VPS, the owner opened three Claude sessions and asked for the work to be split between them. tasksnearme-b2 coordinates: it runs the full gate, owns the dev server and keeps `state.md`. Heavy jobs take turns through `node scripts/heavy.mjs`. Migration numbers are reserved per session.

| # | Item | Session | What it includes |
|---|---|---|---|
| 5.1 ◐ | Staff analytics (B-067) | tasksnearme-89 | `/admin/metrics`, daily for the market: the funnel (post → offer → book → complete → rebook), liquidity (offers within 24 h, time to first offer, fill rate by category and area), and reward spend against the caps. Money figures only for the roles blueprint 08 allows. Migration 0044 if needed |
| 5.2 ☐ | Runbooks (B-066) | tasksnearme-89 | `docs/runbooks/`: a payments incident, a webhook backlog, dispute handling, reward fraud review and safety escalation, grounded in the real staff pages, jobs and code paths |
| 5.3 ◐ | Private-beta access (B-068) | tasksnearme-8f | Invite codes and cohort flags per market and role (poster, helper). Sign-up and helper onboarding honor them. Staff create, limit and revoke codes and see who joined. Everyone else gets the waitlist. Migration 0045 |
| 5.4 ☐ | Bot protection with Turnstile (part of B-061) | tasksnearme-8f | An adapter like the other providers: a stand-in in development and tests, switched on by its keys, and checked on the server for sign-in code requests, sign-up and posting |
| 5.5 ◐ | A shared cache store for several web instances | tasksnearme-b2 | A `cacheHandlers.default` that keeps entries in memory (size-bounded) but records tag invalidations in Postgres (migration 0043). Each instance reads newer invalidations once per request (`refreshTags`) before it serves, and old tag rows are pruned. Lifts the "run one web instance" limit in `blocked.md` |
| 5.6 ☐ | Security review (the rest of B-061) | next free session | Authorization tests for every server action and route handler (role, ownership, staff permissions), the CSP and rate limits, `npm audit`, and a secret scan. High and critical findings get fixed |
| 5.7 ☐ | Performance (B-063) | next free session | Public page budgets (blueprint 07 §6); per-page message catalogs (today every page ships about 76 KB of messages); image sizes; indexes for the hot queries (checked with EXPLAIN); a k6 script at 10× beta volume |
| 5.8 ☐ | Accessibility audit (B-062) | next free session | WCAG 2.2 AA: keyboard-only e2e runs of the core journeys, focus order and visible focus, names for screen readers, and fixes |
| 5.9 ☐ | Two-account scenario suite (B-060) | next free session | Close the partial and missing T-01–T-30 rows in `final-report.md` with e2e or integration tests |
| 5.10 ☐ | UI refinement (owner, 2026-11-13: "refine all uis and elements") | next free session | A pass over every screen at 360 and 1280. Includes the open issue about the landing page's featured helpers on phones |

Needs the owner (`blocked.md`): live provider accounts and keys (B-065), final legal text (B-064) and deployment.

## Part 6 — Identity in two stages, badges, and the profile's first page (owner, 2026-11-13)

The owner's request: "Testing with my own platform ID and selfie check as Persona does (and save for a while until review is correctly done) and then do check again with given Persona link again for double check. Show that $50 gift card and that id check workflow at the profile first page. And as github, once they verify each verifications, add badge and once they finish task, make some types of special badges and add to users. And suggest any good ideas about logic."

This changes blueprint 06 §1: Persona was its fallback (F15) and becomes the double check. Stripe Identity stays as the alternative when only Stripe keys are set.

| # | Item | Session | What it includes |
|---|---|---|---|
| 6.1 ☐ | Our own ID check (stage 1) | tasksnearme-b2 | Guided capture: the document type, a photo of the front (and of the back, except for passports), and a live selfie taken with the camera that follows a random prompt (for example "look to your left"). Photos are re-encoded (no location or metadata) and stored privately and encrypted. Claude reads the ID's text (whether the name matches, 18 or older, not expired, document type) and never compares faces. In the identity queue, staff open the photos through a logged 5-minute link, compare the selfie and the prompt, and approve or reject with a reason. The current attempt limits apply. The Texas biometric notice covers our capture |
| 6.2 ☐ | Persona double check (stage 2) | tasksnearme-b2 | Once staff approve stage 1, the helper gets a one-time Persona link. Results arrive through a signed webhook at `/api/webhooks/persona`, with a stand-in in development and tests. If Persona approves, the ID is cleared. If Persona declines what we approved, the helper is paused and staff get a "mismatch" case. Our photos are deleted once both stages are final, and at the latest 30 days after the decision. Clients' risk-triggered checks use Persona alone |
| 6.3 ☐ | Identity extras | tasksnearme-b2 | Duplicate IDs: a keyed hash of the document number, issuing state and birth date, so the same ID on a second account goes to staff, while the number itself is never stored. A reminder 30 days before the ID expires (only the month is stored). A new check after a legal name change |
| 6.4 ☐ | Badges, like GitHub achievements | tasksnearme-89, after 5.1 | Verification badges (phone, ID double-checked, address, background check) and tiered achievement badges: tasks completed (1, 10, 25, 50, 100), five-star reviews, on time, booked again by clients, category pro, regular visits and founding helper, plus badges for clients. Counted from completed and paid bookings across distinct clients, recomputed on events, announced with a notification, and revocable by staff. Shown on the public profile, on helper cards (top 3) and on the account page |
| 6.5 ☐ | The profile's first page | tasksnearme-89, after 5.1 | At the top of the first onboarding page and of the profile editor: the $50 founding-helper gift card (spots left, what's still needed, progress) and the verification steps, each with its state and next action. Also a verification section on the account page, which has none today |
| 6.6 ☐ | Fixes found while planning | tasksnearme-89, with 6.4–6.5 | Founding numbers are given out as helpers clear verification (today only the seed data sets them, so "spots left" never moves). Clients' ID checks stop counting toward the founding 100. `helper_profiles.completed_count` is kept up to date |
