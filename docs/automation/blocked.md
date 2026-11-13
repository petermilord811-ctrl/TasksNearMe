# Needs the user

Things the autopilot can't do alone, and the workaround it uses meanwhile. None of these stop the build.

| Item | Why it needs you | Workaround in use |
|---|---|---|
| Real provider accounts and keys: Stripe (payments, Connect, Identity), Checkr, Tremendous, Twilio, Resend or Postmark, Cloudflare R2, Mapbox, Anthropic | Account creation, contracts, payment details, sender registration (A2P 10DLC), and Connect platform approval | Every adapter is built and tested against the provider's documented API. Each one switches on when its keys are set (see `.env.example` and docs/integration-points.md), and the stand-ins cover development. Production refuses to fake texts, file storage, payments and gift cards without them |
| Final legal text (terms, privacy, helper agreement, rewards terms) | Needs counsel (blueprint 06 §5) | Pages marked "Draft — pending legal review" |
| Deployment (Render, domain, DNS) | Accounts and billing | Local only. The build stays deployable (`npm run build`) |
| Web push notifications | Done (plan 3.5): "Notifications on this device", VAPID keys from `npm run push:keys` | — |
| Errands (blueprint 01 §6, phase 2) | Vehicle use and insurance review, and the TxDMV and licensed-work limits (F17), need counsel and an insurance decision | Not built: errands stay out of the categories; moving stays labor-only |
