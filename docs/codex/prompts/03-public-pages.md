# Prompt 03 — Public pages

**Plan first:** yes · **Depends on:** 02 · **Branch:** `ui/03-public`

## Read first
- `AGENTS.md`
- `docs/codex/design-system.md` §3 (public layout), §6 (voice)
- `docs/codex/ui-contract.md` §5, §7 (open public tasks), §10, §11
- `docs/blueprint/01-product-brief.md` §1, §3, §6 (categories: what's included and excluded)
- `docs/blueprint/02-sitemap-and-journeys.md` §1.1
- `docs/blueprint/04-payments-and-fees.md` §3 and §6 (for `/pricing`)
- `docs/blueprint/05-rewards.md` §4 (welcome terms for `/become-a-helper`)
- `docs/blueprint/06-verification-trust-compliance.md` §1 (what the badges mean)

## Build
1. **`/`** Home sections:
   - Hero ("Book trusted local help for everyday tasks" + **Post a task**).
   - How it works in 3 steps.
   - The 5 category tiles.
   - A trust strip: ID-verified helpers; "You pay when you book. Your helper is paid after the task is done."; address privacy.
   - Austin coverage, a become-a-helper band, and an FAQ.
2. **`/austin`** market landing: categories, recent public tasks, featured helpers, and a coverage note (Austin plus nearby ZIP codes; anywhere else goes to `/waitlist`).
3. **`/austin/[category]`** (all 5):
   - What's included and what isn't (01 §6.1).
   - Price guidance (ui-contract §11) and how fixed vs hourly pricing works.
   - Recent public tasks in the category, top helpers, and a CTA.
4. **`/austin/tasks`** public board:
   - Filters: category, date range, budget.
   - Public `TaskCard`: title, category icon, area name, window, budget, offer count. **No photos.**
   - An empty state.
5. **`/tasks/[taskSlug]`**, public view:
   - Title, category, `GeneralArea` with `AreaMapPlaceholder` (1-mile circle), window, budget, offer count.
   - The scrubbed excerpt and the poster's trust signals (first name + initial, member since, phone verified).
   - CTA **Sign in to make an offer**.
   - Prompt 07 adds the helper view to this same route, so build the page to switch on the viewer.
6. **`/helpers/[handle]`** for Sam (rich history) and Jordan (new founding helper):
   - Header: initials avatar, name, headline, area, and `VerificationBadges` with tooltips.
   - Stats (rating, completed, response time); services and rates; tools.
   - Work samples (fixture SVGs), Jordan's availability posts, and paginated reviews.
   - **Request booking**: signed out goes to sign-in; signed in goes to `/app/helpers/[handle]/request`.
7. **Info pages:**
   - **`/how-it-works`** with tabs for posters and helpers.
   - **`/become-a-helper`**:
     - Requirements: ID check, payout setup, and a background check for in-home categories.
     - "On a $60 task you earn $54.00", and first-payout timing.
     - Founding welcome reward terms (05 §4), including "Rewards never depend on reviews or ratings."
   - **`/pricing`**:
     - The fee formula; the $60 example for both sides; an hourly example; expenses.
     - The cancellation summary from 04 §6. **Every value comes from `fees.ts`.**
   - **`/trust-and-safety`**:
     - Verification and address privacy.
     - Payment timing. Use the voice sentence; never "escrow".
     - Review policy, reporting, and safety.
8. **`/help`** and **`/help/[...slug]`**: 8 fixture articles (posting, pricing and fees, cancellations, approval and disputes, payouts, rewards, safety, privacy) with client-side search.
9. **`/legal/[doc]`**: the 7 documents (terms, privacy, helper-agreement, cancellation-policy, rewards-terms, community-guidelines, prohibited-tasks).
   - Each has a **"Draft — pending legal review"** banner and outline headings.
   - `prohibited-tasks` lists the excluded work from ui-contract §11 and 01 §6.1.
10. **`/sign-in`**:
    - Flow: email → 6-digit code (in the mock, `123456` works) → phone verification when needed → `/app` as Maya.
    - A "Demo: sign in as a helper" link signs in as Jordan.
    - Error states: wrong code, expired code, too many tries.
11. **`/waitlist`**: ZIP code and email form, with the outside-area message.
12. **SEO.**
    - Metadata and OpenGraph on every page.
    - JSON-LD only on public task and helper pages, with privacy-safe fields only.
    - `robots.ts` and `sitemap.ts` built from the fixtures.

## Tests
- E2E: every page at both viewports with axe; the sign-in flow; the board filters.
- **`tests/e2e/privacy-public.spec.ts`:** for every public route, fetch the HTML (including metadata and JSON-LD) and assert it contains none of these:
  - "1234 Example Lane" or "Buzz 2B"
  - Any fixture last name
  - Any fixture email or phone number

## Acceptance
Definition of done in AGENTS.md. Update the Public section of `docs/ui-progress.md`.

## Out of scope
The helper view of `/tasks/[taskSlug]` (prompt 07) and the signed-in request page (prompt 08).

## Review (for the human)
At phone width, open `/`, `/austin/furniture-assembly`, the desk's public task page, `/helpers/sam`, and `/pricing`. Check the desk numbers on `/pricing`: $66.00 and $54.00.
