# Needs the user

Things the autopilot can't do alone, and the workaround it uses meanwhile. None of these stop the build.

| Item | Why it needs you | Workaround in use |
|---|---|---|
| Real provider accounts and keys: Stripe (payments, Connect, Identity), Checkr, Tremendous, Twilio, Resend or Postmark, Cloudflare R2, Mapbox, Anthropic | Account creation, contracts, payment details, sender registration (A2P 10DLC), and Connect platform approval | Every adapter is built and tested against the provider's documented API. Each one switches on when its keys are set (see `.env.example` and docs/integration-points.md), and the stand-ins cover development. Production refuses to fake texts, file storage, payments and gift cards without them |
| Final legal text (terms, privacy, helper agreement, rewards terms) | Needs counsel (blueprint 06 §5) | Pages marked "Draft — pending legal review" |
| Deployment (Render, domain, DNS) | Accounts and billing | Local only. The build stays deployable (`npm run build`) |
| ~~Before launch: caching across web instances~~ **Resolved 2026-11-14** | Blueprint 07 runs 2 web instances, and Next's `'use cache'` entries live in each process. The shared tag store shipped: `cache-handlers/shared-tags.mjs` (next.config.ts `cacheHandlers.default`) keeps entries in memory and shares tag invalidations through Postgres (`cache_tag_invalidations`, migration 0048), so an `updateTag` on one instance reaches the other on its next request (decisions.md, 2026-11-14) | Two instances are fine once migration 0048 is applied. Nothing waits on the owner |
| Spanish legal text and SMS cost | A translation of binding terms needs counsel. Spanish texts with accents are sent as UCS-2: 70 characters per SMS segment instead of 160, so they cost more on Twilio | Legal documents show in English with a Spanish note that the English governs; the app, emails and texts are in Spanish |
| Web push notifications | Done (plan 3.5): "Notifications on this device", VAPID keys from `npm run push:keys` | — |
| Errands (blueprint 01 §6, phase 2) | Vehicle use and insurance review, and the TxDMV and licensed-work limits (F17), need counsel and an insurance decision | Not built: errands stay out of the categories; moving stays labor-only |
| A tabletop exercise for a payments outage (B-066 acceptance) | The team has to walk through `docs/runbooks/payments-incident.md` once, using its script and record table | The runbooks are written and checked against the code (cc872fa). The gaps they list as manual are items 5.11–5.15 of `completion-plan.md` |
| An external light penetration test (B-061 acceptance) | An outside tester has to be engaged before launch, and paid | The internal review is done (completion plan 5.6): dev tools local-only, every Server Action and route checked for session, role and owner, /api/auth limited to provider callbacks, a CSP, rate limits on everything that sends or creates, npm audit (no high or critical) and a clean secret scan |
