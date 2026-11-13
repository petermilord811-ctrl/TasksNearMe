# 06 — Verification, trust and safety, and items needing confirmation

> Nothing here is legal or tax advice. Items marked **F#** need confirmation from the named owner before launch, using the facts gathered on 2026-11-10 (sources in [README.md](README.md#verification-log)).

## 1. Three separate tracks

Identity, work eligibility, and payout/tax onboarding answer different questions. They use different providers and data, are stored separately (`identity_verifications`, `eligibility_checks`, `payout_accounts`), and are shown separately.

| | **Identity verification** | **Work eligibility** | **Payout and tax onboarding** |
|---|---|---|---|
| Question answered | Is this a real person who matches a government ID? | May this person take this kind of task on our platform? | Can we legally pay this person and report it? |
| Required for | Every helper, **before publishing a profile or sending offers** | Every helper (platform rules); **in-home categories need a background check** (D7) | Every helper, **before sending offers**, so every offer can actually be booked |
| Provider and flow | **Two stages for helpers** (owner, 2026-11-13; below): **our own capture**, reviewed by our staff, then the provider's hosted check as the double check (**Stripe Identity** for now: redirect URL, single-use, valid 48 h; document + live selfie; no ID number requested; **Persona** replaces it in plan 6.2). Clients' risk-triggered checks are the provider's alone | Our rules plus **Checkr** for background checks: invitation link (valid 7 days with reminders); the candidate enters SSN, DOB, and consent on Checkr's page; FCRA disclosure, authorization, and adverse action through Checkr | **Stripe-hosted onboarding** (Accounts v2 Account Link): legal name, DOB, address, SSN (last 4 first, all 9 if Stripe needs them), bank account. Stripe performs KYC and keeps the data |
| What it includes | Our capture: staff compare the ID's photos with a live selfie that follows a prompt; an automated reading of the ID's text (name match, 18 or older, not expired). The provider: document authenticity, selfie match, age ≥ 18 (from the verified DOB; we store only the boolean) | Age 18+; helper agreement accepted (independent-contractor terms, community guidelines); located in a live market; not suspended; category requirements; background check `clear` for in-home categories; re-check every 12 months (config) | Capability `stripe_transfers` active; requirements current; payouts enabled. **1099s are filed by the platform through Stripe** ($2.99 IRS + $1.49 state per form; e-delivery needs the helper's consent). Thresholds: 1099-NEC/MISC $2,000 (payments after 2025); 1099-K over $20,000 **and** over 200 transactions |
| What we store | Session ID, status, timestamps, pass flags, `is_adult`, name-match flag. Our capture (`identity_captures`): the ID's photos and the selfie, **encrypted, until the checks finish and at most 30 days after our decision**; the decision, its reason and note; the reading's yes/no answers and the expiry month and year, **never the name, birth date or document number** | Status, package, timestamps, adjudication state. **Report contents stay at Checkr** | Account ID, capability and requirement statuses. **No SSN, TIN, or bank details** |
| Public display | **"ID verified · Nov 2026"** | **"Background checked · Nov 2026"** (only when clear and current) | Nothing |
| Cost | $1.50 per completed check (first 50 free) | From about $30 per check (package-dependent); platform-paid for the founding cohort | Stripe Connect fees (04 §8) |
| Re-verification | Risk triggers: account recovery, name change, suspicious device | Annual background re-check; policy changes | Stripe requirement updates (account events) → banner and bookable recompute |

**Onboarding order** (changed 2026-11-12, owner request): profile with the **helper agreement** → services → area → **phone** → **ID** → **home address** → **payout setup** → **background check** (in-home only) → **bookable**.
- The phone comes first among the checks: it's free, and clients and staff need to reach helpers on the day.
- ID comes next because it's cheap and blocks fake accounts early.
- The home address and payouts open together once the ID is verified, so a staff review of the address doesn't hold up payouts.
- Payout setup comes before offers so every offer can be booked.
- The background check is last because it's slow and costly, and only in-home categories need it.

**Home address (added 2026-11-12).** The helper enters the address (address search, confirmed again on submit) and sends one proof of address: a utility, phone or internet bill, a bank or credit card statement, a lease or mortgage statement, an insurance statement, or a letter from a government agency, dated within 90 days, showing the helper's name and the address. Trust and safety (or a support lead or admin) reviews it and approves it or asks for another document, giving the helper a reason. A newer proof (after a move) doesn't undo an earlier verification until staff ask for a new one. The public profile says **"Address verified · Nov 2026"**, never the address.

**ID check rules.** The Texas biometric notice is accepted before the check opens (§3). Three tries per 24 hours, five in all before staff review. An under-18 result closes helper onboarding until staff reopen it. A verified ID whose name doesn't match the account's legal name waits for a staff name check. Changing the legal name, or a staff request, needs a new check. Unfinished sessions close after 48 hours.

**The ID check in two stages (added 2026-11-13, a product decision of the owner's).** The owner asked for our own ID and selfie check, kept until our review is done, with the provider's check after it as a double check. A helper's ID check is now:
1. **Our capture (stage 1).** After the Texas notice, the helper chooses the ID (driver's license, state ID card, or passport) and photographs its front and, except for a passport, its back (with the camera, or from a file on a computer), then takes a **live selfie** with the camera that follows a **random prompt** from a fixed list ("look to your left", "smile", "hold up three fingers next to your face"). The app picks the prompt from a keyed hash of the person and the try, so reloading never changes it. Where the browser has no camera, the phone's camera app is used instead. Every photo is re-encoded (no location or other metadata), **encrypted** with the app's key, and stored privately.
2. **Automated reading.** Claude reads the ID's front once (the name, birth date, expiry date, document type and issuing state, as printed); the app keeps only whether the name matches the account's legal name (the same rule as the provider's name check), whether the person is 18 or older, whether the ID is unexpired, the expiry month and year, and what the document looks like. It's never shown the selfie and never compares faces. Test accounts get a stand-in that reads nothing.
3. **Staff review.** Trust and safety (or a support lead or admin) opens the photos with a logged reason, through 5-minute links, compares the selfie with the ID's photo and checks it follows its prompt, and approves or rejects with a reason the helper sees (unreadable, selfie doesn't match, prompt not followed, under 18, expired, other) and a note for the audit log. Target: 2 days.
4. **The double check (stage 2).** Approval opens the provider's hosted check; its result is what verifies the ID (and its name check applies as before). Helpers verified before stage 1 existed stay verified without a capture.

Each capture counts as a try toward the limits above, as a provider session does (an approved one isn't a failed try). One capture can be in review at a time; after a rejection the helper sees the reason and can try again within the limits; an under-18 rejection closes helper onboarding until staff reopen it. A staff request or a legal-name change starts both stages again. Our photos are deleted 30 days after the stage-1 decision (approved or rejected), at once for a canceled capture or a deleted account; plan 6.2 deletes them sooner once both stages are final.

**Background check rules.** Our summary of the check is acknowledged before Checkr's own FCRA disclosure and authorization. Invitations expire after 7 days. A `consider` result goes to staff, who either approve it (in-home work for 12 months, without the public badge) or start the pre-adverse notice; the final adverse action comes no sooner than 7 days later. Renewals open 30 days before a check runs out, with notices at 30 and 7 days.

**Posters:** a verified phone number to post, and a card (with Stripe Radar) to book. ID checks for posters are risk-triggered in phase 2 (high-value tasks, flagged accounts). Asking every poster for ID at launch would cost more in conversion than it adds in safety.

**Not collected:** Form I-9 or work-authorization documents. Helpers are independent contractors, not employees; counsel confirms under **F5**.

**What the public badge does not say:** the tooltip explains that "ID verified" means a government ID and selfie matched at the date shown, and "Background checked" means the named check came back clear at that date. Neither is a guarantee of work quality. No document type, birth date, last name, or location detail is ever shown.

### D7 — Background checks (founders to sign off)

- **Recommendation:** require a background check before helpers can take **in-home** tasks: assembly, moving help, cleaning, and in-person computer help. Yard cleanup and remote help don't require one.
- The platform pays for the founding cohort, about 100 × $30–$60.
- **Contingency:** if Checkr credentialing and FCRA review (**F9**) aren't finished by M7, launch with yard cleanup and remote computer help only, and enable the in-home categories when ready. The category flag `requires_background_check` makes this a config change.

## 2. Trust and safety controls at launch

| Stage | Controls |
|---|---|
| Sign-up and posting | Email and phone verification; Turnstile; DB-backed rate limits; new-account limits (first 7 days: 3 open tasks, 10 offers per day); prohibited-task keyword detection; image re-encoding with metadata removed |
| Pre-booking | Contact details masked in messages; offers only from bookable helpers; blocking; report buttons on profiles, tasks, messages, and reviews |
| During the booking | Address shown only to the confirmed helper, only for the allowed window, with each view logged; check-in; **safety button** in the booking hub (shows "call 911" first, then an urgent support case and an on-call page); one-tap late and arrived updates |
| After the booking | Double-blind two-way reviews; no-show and late-cancel **strikes** (3 within 90 days → suspension review); appeals |
| Money | Stripe Radar rules; early fraud warnings trigger holds; reward risk signals; aging-funds alerts |
| Staff | Role-based access with limits and dual control (08 §4); TOTP; reason prompts and audit log for restricted data; no production impersonation |

## 3. Privacy notes

- **Biometrics (Texas CUBI, Bus. & Com. Code §503.001):** capturing face geometry for a commercial purpose requires informing the person and getting consent first. The identifier must be destroyed within a reasonable time, and no later than 1 year after the purpose expires. Penalties run up to $25,000 per violation.
  - We show our own **biometric notice and consent** (stored in `agreements`, versioned) before the ID check. Since 2026-11-13 it covers our own capture too: we take the ID's photos and a selfie, our staff compare them, we keep them encrypted until the checks finish and delete them at most 30 days after our decision, and a provider then double-checks.
  - Stripe's default retention for biometric data is at most 1 year. We'll schedule a redaction request after verification completes (redaction can take up to 7 days and can't run while a session is processing).
  - Whether a vendor's matching counts as our "capture" is an open question for counsel (**F10**).
- **Texas Data Privacy and Security Act:** small businesses (SBA definition) are exempt except for the ban on selling sensitive data (including biometric data and precise geolocation) without consent. **We don't sell personal data.** Re-check the SBA size test as we grow.
- Retention defaults are in 08 §5.

## 4. Admin and support access (summary)

Staff see **statuses, not secrets**. SSNs, bank details, background reports and the providers' ID images never enter our database. Two exceptions are stored privately, opened only by trust and safety, support leads and admins after giving a reason (logged, through 5-minute links), and deleted 30 days after the decision: the **proof of address** (added 2026-11-12), and the **ID photos and selfie of our own ID check** (added 2026-11-13), which are also encrypted at rest.
- Provider dashboards are restricted: Stripe Identity results need restricted or IP-restricted keys and are limited to the named trust and safety lead and finance lead. Checkr dashboard access goes to the trust and safety lead only.
- Messages and exact addresses are readable by staff only with a reason, and every access is logged.
- The full matrix is in [08-data-model-and-access.md](08-data-model-and-access.md) §4.

## 5. Items to confirm before launch

| ID | Topic | What to confirm | Owner | Blocks launch? |
|---|---|---|---|---|
| **F1** | Stripe Connect fit | Stripe approves the platform for this model: charge at booking, transfer after completion, separate charges and transfers with platform-owned losses, Accounts v2 settings, manual platform payouts. Evaluate funds segregation (private preview) | Eng lead + Stripe | **Yes** |
| F2 | Authorization windows | 48 h invite holds sit inside every network's window (verified: 7 days customer-initiated on all four networks). Extended and incremental authorization need IC+ pricing, so neither is used | Eng | No (verified) |
| F3 | Pricing on our account | Cards 2.9% + $0.30; Connect $2 per active account + 0.25% + $0.25 per payout (clarify one duplicated 0.25% line on the pricing page); Instant Payouts 1%; disputes $15 + $15; Identity $1.50; 1099 fees. Also whether released authorizations cost anything | Finance | No (model input) |
| **F4** | Payment structure | Limited payment collection agent terms; money transmission analysis; "not escrow" language; refund and auto-approval disclosures | Counsel | **Yes** |
| **F5** | Worker classification | Federal (IRS, DOL) analysis. Texas: TWC 40 TAC §815.134 treats marketplace contractors as non-employees **for unemployment purposes only**, and only if 9 conditions hold "in contract and in fact" (for example: paid per job, no required hours, no bar on other platforms, contractor sets time and place and supplies tools, no control of work methods, **no mandatory meetings or training**, requests accepted only through the platform's digital network). Product rules follow this: helpers set prices, choose tasks, and bring tools; guidelines are resources, not mandatory training. Workers' comp is a separate statute | Counsel | **Yes** |
| **F6** | Texas sales tax | Lawn and yard services are taxable real property services (small self-employed exemption may not fit platform contractors). Residential cleaning by a business is taxable; the individual-contractor case is a gray area. Furniture assembly is unclear. Computer repair isn't on the taxable list, but data processing is; remote support is ambiguous. Labor-only moving appears untaxed. Biggest question: are we a **marketplace provider** that must collect tax on taxable services, and are our own fees taxable data processing? | Tax advisor | **Yes** (changes checkout) |
| F7 | Information reporting | Whether helper payments go on 1099-NEC or 1099-K; that we file (Stripe doesn't issue 1099-Ks when the platform collects fees); TIN collection and matching; backup withholding; whether and on which form gift-card rewards are reported | Tax advisor | Before the first year-end |
| **F8** | Rewards terms | Checklist in 05 §6; state promotional rules | Counsel | **Yes** (for rewards) |
| **F9** | Background checks | FCRA standalone disclosure and authorization; pre- and post-adverse action; Texas specifics; Checkr credentialing (entity documents, EIN, flow review); who pays; re-check cadence | Counsel + trust & safety | **Yes** for in-home categories (D7 contingency) |
| **F10** | Biometrics and privacy | CUBI notice and consent and the destruction schedule; Stripe Identity retention and redaction settings; privacy policy; TDPSA status | Counsel | **Yes** |
| F11 | Messaging providers | A2P 10DLC or toll-free verification for alert SMS (about 2 weeks; Verify OTP needs no registration of our own). Twilio Proxy is closed to new customers, so phase-3 masked calls would be built on Programmable Voice | Eng | Alert SMS only |
| **F12** | Reviews | FTC rule: no incentives conditioned on sentiment, no suppression of negative reviews, honest display; published moderation policy. Civil penalties up to $53,088 per violation | Counsel + product | **Yes** |
| **F13** | Insurance | Platform general liability (minimum); occupational accident coverage for helpers (optional); wording of any property-damage promise | Founders + broker | **Yes** (general liability) |
| F14 | Accessibility | WCAG 2.2 AA target and an accessibility statement | Product | No |
| **F15** | Stripe Identity use | Stripe **prohibits using Identity for eligibility decisions covered by the FCRA** and for people under 16. Confirm with Stripe and counsel that identity checks during helper onboarding are a permitted use. Complete the Identity application; restrict dashboard access. **Fallback:** Persona, or Checkr's identity verification | Eng + counsel | **Yes** |
| **F16** | Gift-card provider | Tremendous account approval; bank funding; campaign catalog allowed for promotional use; fraud-review settings | Ops | **Yes** (for rewards) |
| **F17** | Category limits | Exclude licensed work: pesticide and herbicide application, irrigation, mold remediation, electrical, plumbing, HVAC (confirm the agencies and thresholds). Moving stays **labor-only**: TxDMV household-goods carrier rules attach to transporting goods, and the terms must ban transport. Vehicle-insurance review before errands (phase 2) | Counsel | **Yes** (prohibited-task list) |
| **F18** | Consumer protection | Cancellation, refund, auto-approval, and dispute wording (Texas DTPA); price display | Counsel | **Yes** |
| F19 | Checkout presentment | Apple Pay and Google Pay domain registration for every domain and subdomain (including `www`) on the platform account; statement descriptor; receipts | Eng | **Yes** |
| **F20** | Data retention and requests | Retention schedule (08 §5); law-enforcement request policy | Counsel | **Yes** |
