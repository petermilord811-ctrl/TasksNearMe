# UI-037 — Admin: staff roles

**Status:** done, built by Claude on `main` (Codex at its usage limit; decisions.md) · **Depends on:** UI-002 (admin shell), UI-020 (people)

## Goal
`/admin/staff` (blueprint 02 admin routes, 08 §4): admins see everyone with a staff role. Each member is shown with their name, email and roles (when each was added, and by whom).
- **Add a role:** an existing account's email, a role and a reason.
- **Remove a role:** behind a confirmation with a reason.
- **Rules:** every change goes to the audit log. There are always at least two admins (`MIN_ADMINS`), and nobody removes their own admin role. The server decides what's removable (`removable`).

## Contracts and fixtures
- `src/contracts/admin-staff.ts`: `MIN_ADMINS`, `AdminStaffMember`, `AdminStaffPageData`, `staffRoleGrantInputSchema`, `staffRoleRemoveInputSchema`, `AdminStaffHandlers`.
- `src/fixtures/admin-staff.ts`: `adminStaffData` (Riley's view, two admins), `fakeAdminStaffHandlers`.

## States to preview
`screen-admin-staff/{default,grant-errors,granted,remove-dialog,not-allowed}`

## Claude wiring notes
- **Route:** `/admin/staff`, for admins only (other staff get not found). The Staff nav item was already admin-only.
- **Service:** `getAdminStaff`, `grantStaffRole` and `removeStaffRole` in `src/modules/accounts/staff-roles.ts`.
  - An unknown email returns `email: ['invalid']`; a duplicate role returns `role: ['in_use']`.
  - Removing a role locks the admin rows, so two admins can't remove each other at once.
- **Actions:** `grantStaffRoleAction` and `removeStaffRoleAction` in `staff-actions.ts`.
- **Tests:**
  - integration `staff-roles`: admin-only; grant by email once, with the audit; the two-admin minimum; never your own admin role;
  - UI `admin-staff-screen`;
  - e2e `admin-ops.spec` (Riley adds Finance to Taylor and removes it; the audit log shows both).
