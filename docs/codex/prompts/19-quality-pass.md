# Prompt 19 — Accessibility, responsiveness, states, copy, privacy pass

**Plan first:** yes · **Depends on:** every prompt above · **Branch:** `ui/19-quality`

## Read first
- `AGENTS.md` (every rule)
- `docs/codex/design-system.md` §6–§7
- `docs/ui-progress.md`
- `docs/blueprint/10-build-plan-and-launch.md` §3.2 (T-20 address privacy, T-21 contact masking)
- `docs/blueprint/07-architecture.md` §6 (performance targets)

## Build
1. **Coverage.** Extend `tests/e2e/routes.ts` to cover every route × its relevant scenarios × viewers:
   - every booking scenario as both poster and helper;
   - admin pages as each staff role.

   Smoke + axe pass everywhere, with **zero serious or critical violations**.
2. **Keyboard-only E2E** for: the posting wizard, book and pay, approve, propose and accept a change, redeem a reward, and an admin refund.
3. **Responsive checks** at 360, 768, 1024, and 1280 (plus 200% zoom). Automate these:
   - No horizontal scroll (`scrollWidth ≤ innerWidth`).
   - Touch targets of at least 44 px in main content.
   - Sticky bars respect the safe-area insets.
4. **States.** Every route has loading, empty, and error states. Add an E2E that toggles each one from the dev toolbar and checks the right component appears.
5. **Copy.**
   - A test fails if `messages/en.json` contains any banned word (design-system §6).
   - A test checks that the key sentences appear verbatim.
   - Fix inconsistent terms.
6. **Hard-coded strings.** Turn on a lint rule for JSX literals in `src/app/**` and `src/modules/*/ui/**` (for example `react/jsx-no-literals` with a small allow-list) and fix every violation.
7. **Privacy re-check.** Check all of the following for the exact address, last names, emails, and phone numbers:
   - every public route;
   - every helper view and other-helper view;
   - the `.ics` files;
   - metadata and OpenGraph;
   - notification texts;
   - the browser console output (capture it in Playwright).
8. **Performance.**
   - Read the `next build` output and flag any route over 200 kB of first-load JS.
   - Move large client components to server components where possible.
   - Check image sizes and font subsets.
9. **Dark mode and reduced motion.** Capture key screens with emulated dark mode and reduced motion, and fix any contrast or motion issues.
10. **Report.** Write `docs/ui-qa-report.md`: what was checked, the results, and the remaining issues with severity.

## Acceptance
Everything green. `docs/ui-qa-report.md` written. `docs/ui-progress.md` updated.

## Out of scope
New features.

## Review (for the human)
Read `docs/ui-qa-report.md`. Then skim `artifacts/screenshots/` at phone width for anything that looks off.
