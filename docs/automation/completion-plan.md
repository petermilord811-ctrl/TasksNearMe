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
| 3.3 ☐ | Data export and account deletion | The account page records the requests; build the export (a download for the person) and the deletion (anonymize once nothing is open), per blueprint 08 §5 |
| 3.4 ☐ | Retention timers | Blueprint 08 §5: exact addresses deleted 180 days after the last booking unless saved, and the rest of the table where a timer is missing |
| 3.5 ☐ | Web push (the third channel) | Finishes T-29: a service worker, VAPID keys generated locally, a subscription per device, asked only after a related action (posting a task; finishing onboarding), and the account page's "Notifications on this device" |
| 3.6 ☐ | Installable app | A web app manifest and icons, so phones can add TasksNearMe to the home screen (with push) |

## Part 4 — Good features

| # | Feature | Why it's worth it |
|---|---|---|
| 4.1 ☑ | Automatic reading of proof-of-address documents | With `ANTHROPIC_API_KEY`, Claude reads the document once and tells staff whether the name, address and date match. Staff still decide; only the yes/no answers are kept. Stand-in in tests |
| 4.2 ☐ | "Post again" | Posters repeat a past task in two taps (the same category, details and address) |
| 4.3 ☐ | One-tap offer at the posted budget | For fixed-price tasks, helpers offer the asked price straight from the list |
| 4.4 ☐ | Provider adapters for Stripe Identity and Checkr | Written against their APIs with tested webhooks, so adding the keys switches the stand-ins off |

## Order of work

Part 1 first (1.1 → 1.11, about four commits), then 2.1–2.3 (the list and map), 3.1 (alerts, which use the same matching), 2.4–2.5, 3.2–3.4, 4.1, 3.5–3.6, 4.2–4.4. Anything that turns out to need the owner goes to `blocked.md`, with the workaround, and the work continues.
