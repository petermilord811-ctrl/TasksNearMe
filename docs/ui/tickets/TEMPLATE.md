# UI-xxx — <title>

**Status:** draft | ready for Codex | UI done | wired · **Branch:** `ui/UI-xxx-<slug>` · **Plan first:** yes/no · **Depends on:** UI-…

## Goal
One or two sentences: what exists when this is done, and who uses it.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-xxx.md` (last step).

## Read first
- `AGENTS.md`
- `docs/ui/design-system.md` §…
- Contracts: `src/contracts/…`
- Fixtures: `src/fixtures/…`
- Product context: `docs/blueprint/…` §…

## Build
| Component / screen | File | Props (contract types) | Notes |
|---|---|---|---|
| | `src/ui/...` | | |

Handlers this ticket receives and the result codes to handle:

| Handler | Input | Success codes | Error codes |
|---|---|---|---|

Copy namespace(s): `…` (in `messages/en/ui/<namespace>.json`).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|

## Tests
- …

## Acceptance
- Every item in **Build** exists, with every **State to preview** registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint).
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-xxx.md`. That file tells Claude you're done.

## Out of scope
- …

## Claude wiring notes (filled in by Claude after review)
- Route(s): …
- Queries / actions: …
- e2e: …
