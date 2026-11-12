# Needs the user

Things the autopilot can't do alone, and the workaround it uses meanwhile. None of these stop the build.

| Item | Why it needs you | Workaround in use |
|---|---|---|
| Real provider accounts and keys (Stripe, Stripe Identity, Checkr, Tremendous, Twilio, Postmark, Google Maps, Anthropic) | Account creation, contracts, payment details | Fake providers behind the same interfaces. If test-mode keys appear in `.env.local`, Phase 10 wires them |
| Final legal text (terms, privacy, helper agreement, rewards terms) | Needs counsel (blueprint 06 §5) | Pages marked "Draft — pending legal review" |
| Deployment (Render, domain, DNS) | Accounts and billing | Local only. The build stays deployable (`npm run build`) |
| Web push notifications | A product choice: when and how to ask for the browser's permission, and which updates are worth a push. Also needs a service worker and VAPID keys | Email and text messages by preference, with quiet hours (T-29). The delivery job and `notification_deliveries` take a third channel without changes to the planner's shape |
