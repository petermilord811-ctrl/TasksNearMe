# UI-030 — Fix: the bottom tab bar covers the booking page's action bar on phones

**Status:** ready for Codex · **Branch:** `ui/UI-030-mobile-action-bar` · **Plan first:** no (unattended) · **Depends on:** UI-016 (merged)

## Goal
On phones, the booking page's action bar is fixed to the bottom of the screen (`ActionBar` with `mobileFixed`). The app's bottom tab bar is also fixed there (`fixed inset-x-0 bottom-0 z-30`, `lg:hidden`) and sits on top. Taps on **More**, and on the primary action, land on the tab bar instead. An e2e test found it: tapping **More** on `/app/bookings/bkg_tv` at 390 px fails because "the tab bar subtree intercepts pointer events". The flow is blocked for every action under More (cancel, safety report, …).

Make every action-bar control reachable and fully visible above the tab bar on phones, on every screen that uses a fixed or sticky action bar inside the app shell. Fix it in the shared components.

## You may edit
`src/ui/**`, `messages/en/ui/**`, and `docs/ui/handoffs/UI-030.md` (last step).

## Build
- The fixed mobile action bar sits above the bottom tab bar, for example by offsetting it by the tab bar's height plus the safe-area inset, with a shared CSS variable or token. Page content can still scroll clear of both bars.
- Check every screen that uses `ActionBar` with `sticky` or `mobileFixed` inside `AppShell`: the booking page, the offer detail page, the helper task view, the booking confirmation and completion forms, and the sheets.

## Tests
- A component or preview test asserts that the fixed action bar's bottom offset accounts for the tab bar on phones.
- The preview harness (360 px) shows the booking page's action bar fully visible above the tab bar: `screen-booking/client-with-sheets`, `screen-booking/helper-with-sheets`.

## Acceptance
- `npm run check:ui` passes.
- Claude re-enables the e2e test "phones can reach the booking actions under More (UI-030)" in `tests/e2e/booking-sheets.spec.ts`; it must pass on the `app-mobile` project.
- **Last step:** the summary is written to `docs/ui/handoffs/UI-030.md`.

## Out of scope
- Anything else in the layout.
