# UI-021 — Quality pass: accessibility, phones, copy, and known issues

**Status:** done (built by Claude; Codex at its usage limit) · **Branch:** `ui/UI-021-quality-pass` · **Plan first:** no (unattended) · **Depends on:** every merged UI ticket

## Goal
Before the private beta, make the member and staff screens consistent and solid (backlog B-062: core journeys pass with a screen reader and keyboard only). This ticket fixes known issues and runs a structured pass over the screens you built. It doesn't add features, and it changes no contracts.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-021.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` (all of it: this pass checks the screens against it)
- `docs/blueprint/10-build-plan-and-launch.md` (B-062 acceptance)
- The preview gallery (`npm run dev`, `/dev/ui`) and the screenshots in `artifacts/ui-previews/`

## Build

### 1. Known issues (fix each)
| Where | Issue | Expected |
|---|---|---|
| Posting wizard, photos step | A native file input | The shared upload control: a labelled button (and a drop zone on wide screens) with the real input visually hidden but focusable; progress, errors and removal announced |
| Support request form, photos | A native file input | The same shared control |
| Message thread | The sticky date chip can cover a photo card while scrolling | The chip never hides message content (offset, or not sticky over attachments) |
| Previews and tests (many) | Above-the-fold images log "detected as the Largest Contentful Paint; add `loading="eager"`" (e.g. `/samples/work-desk.svg`) | The first visible image on a screen gets `priority`/`loading="eager"`; the rest stay lazy |
| `booking-hub-screen.test.tsx` | "shows the hourly estimate, cap and allowance without adding the allowance to the canonical charge" uses the moving booking, whose terms show a $20 allowance its breakdown doesn't fund | Use a fixture whose breakdown funds the allowance (`deskBookingPosterCompletionWithExpenses`: `deskWithAllowanceFundedBreakdown`). Claude then drops the stray allowance from `movingBookingPosterConfirmed` |

### 2. Keyboard and screen reader pass (core journeys)
Post a task; send and revise an offer; book and pay (with bank verification); request a helper and answer an invite; check in, submit work and approve; report a problem; change request; message; review; support case; notifications; account; the staff case page. For each:
- every control is reachable in a sensible order and has a visible focus ring; no keyboard traps; dialogs and sheets return focus to their trigger;
- every field has a label, a hint tied with `aria-describedby`, and errors announced (`aria-live` or focus to the summary);
- headings form an outline (one `h1`; no skipped levels inside a section);
- async results (saved, sent, failed) are announced once, and stay visible long enough to read;
- touch targets are at least 44 × 44 px on phones.

### 3. Phones and long content
At 320, 360, 768 and 1280 px: no horizontal scrolling; long names, titles, addresses and amounts wrap or truncate with the full text available; fixed bars respect safe-area insets; nothing hides behind the bottom tab bar or the fixed action bar.

### 4. Copy
Sentence case everywhere; the same words for the same things ("client", "helper", "task", "booking", "offer", "request", "open time"); errors say what to do next; no developer words ("null", "undefined", ids) in the UI. Money and dates only through `@/shared/format`.

## Tests
- Component tests for the shared upload control (keyboard, labels, announcements, removing a file).
- The message thread's date chip doesn't overlap an attachment (a component or preview check).
- Any accessibility fix that is easy to regress gets a focused test (for example, focus returning to a sheet's trigger).

## Acceptance
- Every row in **Known issues** is fixed.
- `npm run check:ui` passes: previews at 360 and 1280, axe clean (no serious or critical violations), no runtime errors, and no LCP warnings for above-the-fold images in the preview run.
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings or money math.
- The handoff lists what the pass checked per journey and what changed. Anything you found but couldn't fix in `src/ui/**` goes under contract requests or follow-ups.
- **Last step:** the summary (AGENTS.md format) is written to `docs/ui/handoffs/UI-021.md`.

## Out of scope
- New screens or features, contract changes, and the next-intl catalog size (Claude's).

## Claude wiring notes (filled in by Claude after review)
- e2e: rerun the full suite on both projects.
