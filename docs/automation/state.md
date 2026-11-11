# Autopilot state

**Updated:** 2026-11-11 07:50 UTC (iteration 3)
**Phase:** 1 (foundation) is mostly done; public site (UI-003) wired; sign-in backend ready.
**Codex:** UI-004 (sign-in, waitlist, help, legal) handed off; the runner is checking it. UI-005 is ready and launches right after UI-004 merges.
**Database:** Docker `tasksnearme-db` (Postgres 17 + PostGIS) on 54329. `npm run db:up` if stopped; `npm run db:migrate` after pulling migrations.

## Done
- Phase 1: database, markets, policies, flags, audit/outbox tables; Better Auth (email codes); viewer; route-group shells; dev sign-in; dev outbox.
- UI-001 to UI-003: wired and verified. Public pages read from the fee engine (`modules/payments/fees`) and cached market queries.
- UI-004 backend: sign-in step resolver and actions, phone verification (fake SMS), DB rate limits, waitlist.

## Next steps
1. **Process UI-004:**
   - Merge it, then launch UI-005.
   - Review it; take the harness follow-up from the handoff, if any.
   - Wire `/sign-in`: page data from `resolveCurrentSignIn`, actions bound with `next`, `noindex`.
   - Wire `/waitlist` (`joinWaitlistAction`).
   - Wire `/help` and `/help/[article]`, and `/legal/[doc]`. These need Markdown content in `content/` and a parser to `ContentBlock[]`.
   - e2e: sign-up with email code, then name, then phone, reading codes from the dev outbox.
2. **Write content:** help articles (about 8) and legal drafts (7 docs, marked draft).
3. **Phase 1 leftovers:** injectable clock with dev time travel; outbox dispatcher plus jobs (graphile-worker); provider registry.
4. **Phase 2:** tasks module (schema, posting, public projections). This feeds the board, the public task page, and the recent tasks on home and category pages.
5. **UI-006 prep** (posting wizard), so Codex stays busy after UI-005.

## Open issues
- The public layout sends each page twice until UI-005's `PublicShell` viewer-promise fix lands (production home: 390 KB).
- Unknown market or category slugs return 200 with a `noindex` not-found page (streaming). Accepted; see decisions.
