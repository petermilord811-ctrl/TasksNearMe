# UI-038 — Admin: config (policy versions and feature flags)

**Status:** done, built by Claude on `main` (Codex at its usage limit; decisions.md) · **Depends on:** UI-002 (admin shell)

## Goal
`/admin/config` (blueprint 02 admin routes, 08 §4, D16): the launch market's policy and the feature flags, for admins.
- **The policy in use:** its version, its fees summary, and who published it when.
- **Publish a new version:**
  - The form holds every policy value, filled with the version in use: fees as percentages and dollars, cancellation, and timers. Contract helpers convert percentages to basis points and dollars to cents (`bpsFromPercentText`, `parseMoneyInput`).
  - Values must stay within `POLICY_LIMITS`. A value outside its range shows the range in the form's units, and a reason is required.
  - Publishing retires the previous version. New bookings use the new one; existing bookings keep theirs.
- **Versions:** newest first, with their status (in use, draft, retired).
- **Feature flags:** each flag shows its key, description and on/off state. Turning one on or off needs a confirmation with a reason.
- Every change goes to the audit log.

## Contracts and fixtures
- `src/contracts/admin-config.ts`: `AdminPolicyValues`, `POLICY_LIMITS`, `POLICY_FIELDS`, `POLICY_PERCENT_FIELDS`, `POLICY_MONEY_FIELDS`, `AdminPolicyVersion`, `AdminFeatureFlag`, `AdminConfigPageData`, `policyPublishInputSchema`, `flagSetInputSchema`, `AdminConfigHandlers`, `percentText`, `bpsFromPercentText`, `dollarsText`.
- `src/fixtures/admin-config.ts`: `adminConfigData`, `fakeAdminConfigHandlers`.

## States to preview
`screen-admin-config/{default,publish-errors,published,flag-dialog}`

## Claude wiring notes
- **Route:** `/admin/config` for admins (other staff get not found), for the launch market (`DEFAULT_MARKET_SLUG`).
- **Service:** `getAdminConfig`, `publishPolicy` (locks the market's versions, retires the published one, inserts the next) and `setFeatureFlag` (global flags), in `src/modules/markets/admin-config.ts`.
- **Actions:** `publishPolicyAction` and `setFeatureFlagAction` in `config-actions.ts`. They refresh the market's cached public pages.
- **Tests:**
  - integration `admin-config`: publishing runs on a throwaway market, so Austin's fees stay as they are; flags; admin-only; audit;
  - UI `admin-config-screen`: percent and dollar conversion, ranges, and the flag dialog;
  - e2e `admin-ops.spec`: Riley sees version 1 and turns `recurring` on and off.
