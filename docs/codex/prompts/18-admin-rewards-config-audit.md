# Prompt 18 — Admin III: rewards, config, audit, staff

**Plan first:** no · **Depends on:** 16, 14 · **Branch:** `ui/18-admin-config`

## Read first
- `AGENTS.md`
- `docs/codex/ui-contract.md` §4 (`RewardProgramView`, `MarketPolicyView`, `AuditEntry`), §7 (`admin.reward_review`, `admin.policy_v2_draft`), §12
- `docs/codex/design-system.md` §4.2
- `docs/blueprint/05-rewards.md` §1–§4 (rules, caps, stacking)
- `docs/blueprint/03-state-machines.md` §8 (reward states)
- `docs/blueprint/04-payments-and-fees.md` §3 (fees in policy)
- `docs/blueprint/08-data-model-and-access.md` §4 (config and staff are admin only)

## Build
1. **`/admin/rewards`.**
   - **Programs overview:**
     - On/off status and version.
     - Progress bars for budget, reserved, and spent.
     - Cohort claimed / limit, and the monthly cap.
   - **Program detail:**
     - Rules summary, read-only.
     - An admin can create a **draft version** (amount, threshold, caps, hold days), see the diff, and publish with the confirmation "New grants use v2. Existing grants keep their version."
   - **Grants** `DataTable`, filterable by program, status, and helper.
   - **Review queue** (`admin.reward_review`):
     - Risk signals with weights: shared device, shared card fingerprint, shared bank fingerprint, shared IP, address proximity, new account pair.
     - **Approve** or **Reject**, each with a reason.
   - **Grant actions:**
     - **Void**, with a reason.
     - **Reissue**, after a failure or a delivery problem.
     - **Reinstate**, lead only.
2. **`/admin/config`** (admin only; everyone else sees a "No access" page).
   - **Markets:** Austin's status, time zone, boundary (map placeholder), areas, support hours.
   - **Categories:** in-home, background check required, remote allowed, minimum price, price guidance, status.
   - **Policies:** v1 published and v2 draft.
     - The draft editor covers fees (poster % and minimum, helper %), cancellation (free hours, late fee % and minimum), and timers (auto-approve, invite TTL, pending funding, no-show, address hide, lead time).
     - A diff against the published version.
     - **Publish** with the confirmation "Existing bookings keep v1."
   - **Feature flags:** per-market toggles with descriptions. Every change is audited.
3. **`/admin/audit`.**
   - `DataTable` of `AuditEntry` (time, actor, role, action, target, reason), filterable by actor, action, target type, and date range.
   - **Export CSV** of the visible rows (generated client-side).
   - No edit or delete controls; the page states "Audit entries can't be changed".
4. **`/admin/staff`.**
   - Staff list: name, roles, two-step status, last active.
   - Grant or revoke roles: admin only, reason required.
   - Revoking is **blocked** if it would leave fewer than 2 admins.

## Tests
- E2E:
  - Reward review: approve, and reject.
  - Void with a reason.
  - Reinstate works for Morgan (lead) but not Alex (agent).
  - Policy v2: diff, then the publish confirmation.
  - Non-admins can't use config or staff.
  - Audit filters and export.
  - Revoking the last admin is blocked.
- axe at both viewports.

## Acceptance
Definition of done in AGENTS.md. Update `docs/ui-progress.md`.

## Out of scope
Real persistence. Publishing changes only the mock state.

## Review (for the human)
As Morgan, open `admin.reward_review`. As Riley, open `/admin/config` with `admin.policy_v2_draft`. As Alex, try `/admin/config` (you should be refused).
