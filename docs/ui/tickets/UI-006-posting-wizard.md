# UI-006 — Posting wizard

**Status:** ready for Codex · **Branch:** `ui/UI-006-posting-wizard` · **Plan first:** no (unattended) · **Depends on:** UI-005 (merged)

## Goal
The posting wizard at `/app/tasks/new` (blueprint 02 J1): category → describe (with optional "Help me describe this") → details → photos → where → when → budget → review and post. The screen holds the draft while the person moves between steps; every rule comes from the contract schema and page data. Claude wires it to the tasks module (it runs inside `AppShell`).

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-006.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` §4.1 (field pattern), §6 (voice), §7 (forms accessibility, no auto-submit)
- `docs/blueprint/02-sitemap-and-journeys.md` **J1** (the steps), `01-product-brief.md` §6.1 (what each category includes)
- Contracts:
  - **`src/contracts/posting.ts`:** `PostTaskPageData`, `POST_TASK_STEPS`, `CATEGORY_DETAIL_FIELDS`, `createTaskDraftSchema`, `TaskDraftInput`, `AddressSuggestion`, `AiDraftResult`, `PhotoUploadResult`, `PostTaskHandlers`.
  - `actions.ts`: new `QueryHandler`; new codes `limit_reached`, `prohibited`, and `out_of_range` (see below).
  - `marketing.ts` (`CategoryView`: guidance, minimums, `remoteAllowed`), `money.ts`, `routes.ts`.
- Shared: `@/shared/format`, including new **`parseMoneyInput` / `formatMoneyInput`** for dollar fields (the draft holds cents) and `marketLocalToUtc` if you need it.
- Fixtures: `src/fixtures/posting.ts` (page data, three drafts, addresses, AI draft, photos, results, `fakePostTaskHandlers`).

## Contract changes since UI-005 (main is green; please review)
- `FIELD_ERROR_CODES` gained `prohibited` and `out_of_range`. `ACTION_ERROR_CODES` gained `limit_reached`.
- To keep `main` green, Claude added placeholder copy for them in `forms.json` (`fieldErrors.prohibited`, `fieldErrors.out_of_range`, `actionErrors.limit_reached`) and `feedback.json` (`error.limit_reached`). Rewrite the wording as you see fit.
- Fix from the UI-004 review: `waitlist.marketsTitle` says "Already in Austin?". Build it from `data.markets` (for example "Already in {market}?") or make it market-neutral.

## Build

**Screen** (`src/ui/screens/posting/post-task-screen.tsx`, client): `PostTaskScreen` with props `data: PostTaskPageData`, `handlers: PostTaskHandlers`.

- **One form, eight steps.** Use react-hook-form with `zodResolver(createTaskDraftSchema(data))`. **Next** validates only the current step's fields (`trigger([...])`); **Back** never validates. Show a step indicator ("Step 3 of 8 · Details") and keep the current step in the URL hash or local state (your choice). On phones, one step per screen, with a sticky bottom bar for Back and Next.
- **Draft persistence:** keep the in-progress draft in `sessionStorage` so a refresh doesn't lose it, and clear it after a successful post. Never store photos' file data, only the uploaded photo ids.
- **Steps:**

| Step | Content |
|---|---|
| `category` | The 5 categories as large choices (icon, name, one-line scope). Skip to `describe` when `initialCategory` is set (Back still reaches it) |
| `describe` | Title (counter, max 80) and description (counter, max 2000). When `aiDraftingEnabled`, add **Help me describe this**: a textarea for "say it your way", which calls `onDraftWithAi`. On success, show the suggestion (title, description, details, open questions as a checklist) with **Use this** (fills title, description, and details; the person can still edit everything) and **Keep mine**. **Nothing is posted automatically.** Handle `unavailable`, `rate_limited`, and `prohibited` (a link to `routes.legal('prohibited-tasks')`) |
| `details` | Render `CATEGORY_DETAIL_FIELDS[category]` generically: `choice` as radio cards or a select, `count` as a stepper, `yes_no` as a switch or radio pair, `text` as an input. Labels, hints, and option labels come from copy keyed by `postTask.details.<category>.<key>` |
| `photos` | Optional, up to `rules.maxPhotos`. A file picker (`accept="image/jpeg,image/png,image/webp,image/heic"`) uploads each file with `onUploadPhoto(formData)` (`formData.append('file', file)`). Show a local preview while uploading and a remove button for each, and handle every `PhotoUploadResult` code. A reminder: keep house numbers, mail, and faces out of the frame. Only photo ids go into the draft (`photoIds`) |
| `where` | Local or remote. Remote is offered only when the category's `remoteAllowed`. **Local:** address search with debounced `onSearchAddresses` (from 3 characters, 300 ms) as an accessible combobox. Picking an in-area result sets `location.placeId` and shows the preview "Helpers see: Mueller, Austin. Your exact address goes only to the helper you book." An out-of-area result can't be picked: show "We're not in that area yet" with `routes.waitlist()`. Optional unit and access notes ("only your booked helper sees this") |
| `when` | Date (native date input or a calendar limited to today … today + `rules.maxLeadDays`, in the market time zone), then either a window (start and end, 30-minute steps) or "Any time that day" (`flexible`). Explain the rule: at least `rules.minLeadHours` hours from now, at most `rules.maxLeadDays` days out |
| `budget` | Fixed or hourly; the default comes from the category's `defaultPricingType`. Fixed: the price in dollars (`parseMoneyInput` to cents), with guidance "Typical in Austin: $50.00–$80.00 per item" from `priceGuidance`. Hourly: rate, estimated hours, and an hour cap (0.5 steps), with `minHours` explained. An optional expense allowance (amount and what it's for). Never compute fees here |
| `review` | Three columns or sections. **Everyone sees:** title, category, area or "Remote", date and window, budget. **Signed-in helpers also see:** description, details, photos. **Only your booked helper sees:** address, unit, access notes. Call `onQuote({ budget, expenseAllowanceCents })` and show `PriceBreakdown` (poster variant) labeled "If you book at this price". Then **Post task** → `onPost(values)`. On ok, `router.push(result.redirectTo)`. On `validation_failed`, map dotted `fieldErrors` onto fields and jump to the first step with an error. On `limit_reached`, show an alert |

- Errors use the forms convention from UI-004: codes → `forms.fieldErrors.*`, with field-specific overrides where they read better (for example `out_of_range` on `schedule.startTime`: "Pick a start at least 3 hours from now").
- Copy namespace: `postTask` (steps, fields, details per category, review). Never "hire", "wages", or "employer".

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-post-task/category` | `postTaskPageData` | Step 1 |
| `screen-post-task/describe-ai`, `/describe-no-ai` | `postTaskPageData`, `postTaskComputerHelpNoAiData` | With and without "Help me describe this" |
| `screen-post-task/ai-suggestion` | `aiDeskDraft` shown as the suggestion | Use this / Keep mine |
| `screen-post-task/details-furniture`, `/details-moving`, `/details-computer` | The drafts' categories | Generic detail fields |
| `screen-post-task/photos` | `uploadedTaskPhotos` | Two uploaded, picker available |
| `screen-post-task/where-local`, `/where-remote`, `/where-out-of-area` | `addressSuggestions`, `remoteHelpDraft`, `outOfAreaSuggestion` | Address preview, remote, waitlist |
| `screen-post-task/when-window`, `/when-flexible` | `deskDraft`, `remoteHelpDraft` | — |
| `screen-post-task/budget-fixed`, `/budget-hourly` | `deskDraft`, `movingDraft` | Guidance, hourly cap, allowance |
| `screen-post-task/review-desk`, `/review-moving` | `deskDraft` + `deskBreakdown`, `movingDraft` + `movingFundedBreakdown` | Visibility sections, quote |
| `screen-post-task/error-prohibited`, `/error-limit` | `postTaskResults.prohibited`, `.limitReached` | — |

To preview a step, let the screen accept an optional `initialStep` and `initialValues` (preview-only props are fine; document them).

## Tests
- Next on `describe` with an empty title shows `required` and stays on the step; Back never validates.
- **Use this** fills the title, description, and details from `aiDeskDraft`; nothing calls `onPost`.
- Details render every `CATEGORY_DETAIL_FIELDS` entry for each category (iterate the constant).
- Address search waits for 3 characters, debounces, picks an in-area result, and refuses `outOfAreaSuggestion` (the waitlist link is present).
- The budget field turns "$60" into `priceCents: 6000`; "12.345" shows `invalid`.
- Review calls `onQuote` with the budget and shows $66.00 for the desk. Post sends `deskDraft`-shaped values and pushes `redirectTo`.
- `validation_failed` with `schedule.startTime: ['out_of_range']` jumps to `when` and shows the error.
- `sessionStorage` restores a draft after remount and is cleared after a successful post.
- Copy exists for every detail field and option (iterate `CATEGORY_DETAIL_FIELDS`). Banned words.

## Acceptance
- Every item in **Build** exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint). The screen never computes fees or dates beyond display.
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-006.md`.

## Out of scope
Routes, task creation, uploads storage, geocoding, and the AI drafter (Claude). Editing a posted task (UI-007). Inviting helpers directly (UI-010).

## Claude wiring notes (after review)
- Tasks module (Phase 2): schema (tasks, task_photos, task_locations encrypted), posting service (prohibited keywords, new-account limits, exact address encryption, public area point), the fake geocoder (Austin sample addresses) and its provider port, uploads (local dev storage with re-encoding), the fake AI drafter (Anthropic adapter when a key exists), and quote via the fee engine.
- `/app/tasks/new` requires a verified phone (the sign-in flow handles `next`).
