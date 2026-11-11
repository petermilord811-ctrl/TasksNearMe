# UI progress

Codex updates this file at the end of every prompt. Mark `[x]` when a route has every state the prompt asks for and passes the smoke + axe tests at 360 and 1280 widths. Add short notes for gaps.

Legend: `[ ]` not started · `[~]` stub or partial · `[x]` done

## Foundations

- [ ] 01 Scaffold, tokens, fonts, i18n, layouts (public / app / admin), test tooling, route stubs
- [ ] 02 View-model types, fixtures, scenarios, transitions, dev toolbar, `/dev/scenarios`, `/dev/components`
- [ ] 02 Domain functions with tests: fees, booking/offer/invite/reward actions, address visibility, formatters
- [ ] 02 Shared components: Money, PriceBreakdown, StatusBadge, BookingStateBanner, ActionBar, PolicyPreview, Deadline, cards, VerificationBadges, RatingStars, ReviewCard, Timeline, GeneralArea, ExactAddressPanel, MaskedText, EmptyState, ErrorState, PageSkeleton, DemoBadge, PaymentFormPlaceholder, PhotoPicker, StepWizard

## Public (prompt 03)

- [ ] `/`
- [ ] `/austin`
- [ ] `/austin/[category]` (5 categories)
- [ ] `/austin/tasks`
- [ ] `/tasks/[taskSlug]` (public view)
- [ ] `/helpers/[handle]`
- [ ] `/how-it-works` · `/become-a-helper` · `/pricing` · `/trust-and-safety`
- [ ] `/help` · `/help/[...slug]`
- [ ] `/legal/[doc]` (7 drafts)
- [ ] `/sign-in` · `/waitlist`

## Poster (prompts 04, 05, 08)

- [ ] `/app` poster home (05)
- [ ] `/app/tasks/new` wizard (04)
- [ ] `/app/tasks` (05)
- [ ] `/app/tasks/[taskId]` (05)
- [ ] `/app/tasks/[taskId]/offers/[offerId]` (05)
- [ ] `/app/tasks/[taskId]/offers/[offerId]/confirm` (08)
- [ ] `/app/helpers` (05)
- [ ] `/app/helpers/[handle]/request` (08)
- [ ] `/app/saved` (05, 13)

## Helper (prompts 06, 07, 13)

- [ ] `/app/helper/onboarding/[step]` (06)
- [ ] `/app/helper/profile` (06)
- [ ] `/app` helper home (07)
- [ ] `/app/find-work` (07)
- [ ] `/tasks/[taskSlug]` helper view + offer form (07)
- [ ] `/app/offers` + invite sheet (07)
- [ ] `/app/availability` (07)
- [ ] `/app/clients` (13)

## Bookings (prompts 09, 10, 11, 13)

- [ ] `/app/bookings` (09)
- [ ] `/app/bookings/[bookingId]`: all states, both roles (09)
- [ ] Status updates, change requests, cancel, no-show, can't access, safety (10)
- [ ] `/app/bookings/[bookingId]/changes/[changeId]` (10)
- [ ] `/app/bookings/[bookingId]/complete` (11)
- [ ] `/app/bookings/[bookingId]/problem` and dispute / settlement (11)
- [ ] `/app/bookings/[bookingId]/review` (13)

## Messages, money, account (prompts 12, 14, 15)

- [ ] `/app/messages` · `/app/messages/[threadId]` (12)
- [ ] `/app/payments` (14)
- [ ] `/app/earnings` (14)
- [ ] `/app/rewards` (14)
- [ ] `/app/notifications` + bell sheet (15)
- [ ] `/app/account` (15)
- [ ] `/app/support` · `/app/support/[caseId]` + report/block flows (15)

## Admin (prompts 16, 17, 18)

- [ ] `/admin/verify` · `/admin` queues (16)
- [ ] `/admin/users` · `/admin/users/[userId]` (16)
- [ ] `/admin/tasks/[taskId]` · `/admin/reports` (16)
- [ ] `/admin/bookings` · `/admin/bookings/[bookingId]` (17)
- [ ] `/admin/cases` · `/admin/cases/[caseId]` (17)
- [ ] `/admin/payments` (17)
- [ ] `/admin/rewards` (18)
- [ ] `/admin/config` (18)
- [ ] `/admin/audit` · `/admin/staff` (18)

## Quality and handoff (prompts 19, 20)

- [ ] Accessibility, responsiveness, loading/empty/error states, copy, privacy re-check (19)
- [ ] Route inventory, screenshot gallery, `docs/integration-points.md`, root README (20)

## Optional phase 2 (prompt 21)

- [ ] `/app/series/[seriesId]` and recurring flows (behind `recurring`)

## Notes

<!-- Codex: add dated notes here, e.g. "2026-11-12 (prompt 03): legal pages use placeholder copy; waiting on counsel." -->
