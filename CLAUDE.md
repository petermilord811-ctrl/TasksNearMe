# CLAUDE.md — TasksNearMe

Person-to-person marketplace for booking local help, launching in Austin, TX. Product source of truth: `docs/blueprint/` (01 brief → 11 backlog).

## Working model: Claude builds the app, Codex builds the UI

- **Claude (you):** architecture, routes, data, domain logic (state machines, fees, visibility, permissions), server actions, integrations, tests, and **wiring Codex's screens to real data**.
- **Codex:** only the UI, from UI tickets you write. Codex's rules are in `AGENTS.md`; read it so your tickets match them.
- **Contract first.** Before Codex starts a screen, you prepare:
  1. Contract types in `src/contracts`: view models, handler input types, action ids, and zod form schemas when there are forms.
  2. Canonical fixtures in `src/fixtures` covering every state the screen must show.
  3. A ticket from `docs/ui/tickets/TEMPLATE.md`.
  4. A row in `docs/ui/progress.md`.
- **Hand-off and wiring.** The user runs Codex with the ticket. When the user says a ticket is done, review it (checklist below), wire it, add e2e tests, and update progress.
- If Codex lists **contract requests**, decide on each, implement the accepted ones in contracts and fixtures, and tell the user what to send back to Codex.

## Ownership (ESLint enforces the import boundaries)

| Path | Owner | Notes |
|---|---|---|
| `src/app/**` | Claude | Routes, layouts, route handlers. Never import `@/fixtures` |
| `src/contracts/**`, `src/shared/**`, `src/fixtures/**` | Claude | Isomorphic only: no server code, no React components |
| `src/modules/**`, `src/platform/**`, `src/integrations/**`, `src/i18n/**` | Claude | Server and domain code |
| `messages/en/app/**` | Claude | Top-level namespace `server` only |
| `tests/**` | Claude | e2e (`tests/e2e`), preview harness (`tests/ui-previews`) |
| `src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json` | **Codex** | Don't restyle or rewrite. Write a fix list for the user to send to Codex instead |
| `docs/ui/**` | Claude | Tickets and contract docs. Codex only updates its row in `progress.md` |

The only Codex-path files you created are setup stubs: `src/ui/theme/*`, `src/ui/previews/registry.ts` and `harness.preview.tsx`, `src/ui/README.md`, and `messages/en/ui/*`.

## Next.js 16.4 rules

- Read `node_modules/next/dist/docs/` before using a Next API. It is newer than your training data.
- **Cache Components is on.** Reading `cookies()`, `headers()`, `searchParams`, or `params` must happen inside a `<Suspense>` boundary (use a Codex skeleton as the fallback), or the data must be cached with `"use cache"`. Otherwise the build fails with a blocking-route error.
- Request middleware is `src/proxy.ts`, not `middleware.ts`.
- Tailwind runs through `@tailwindcss/turbopack` (configured in `next.config.ts`).

## Wiring pattern

```tsx
// src/app/(app)/app/bookings/[bookingId]/page.tsx — Claude
export default function Page({ params }: { params: Promise<{ bookingId: string }> }) {
  return (
    <Suspense fallback={<BookingHubSkeleton />}>
      <BookingHub params={params} />
    </Suspense>
  );
}

async function BookingHub({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const viewer = await getViewer();
  const data = await getBookingHubView(bookingId, viewer); // returns a contract type, role-projected
  if (!data) notFound();
  return <BookingHubScreen data={data} onAction={runBookingAction} />; // Server Action passed as a handler
}
```

- Server actions live in `src/modules/<module>/actions.ts` (`'use server'`). They validate with the contract's zod schema, return `ActionResult`, and revalidate.
- Queries return contract types already filtered for the viewer: exact address, messages, and money per role, as in `docs/ui/ui-contract.md` §5.
- Which actions a viewer gets comes from pure domain functions. The UI never decides.

## Writing a UI ticket

Start from `docs/ui/tickets/TEMPLATE.md`. Every ticket has:
- the goal and the paths Codex may edit;
- the exact contract and fixture files;
- the components and screens to build, with their props types;
- every state to preview;
- the handlers and result codes to handle;
- the copy namespace;
- acceptance criteria and what's out of scope.

Before handing a ticket off, `npm run check` must pass, with the contracts compiling and fixtures present for every listed state.

## Reviewing Codex output

1. `git diff --stat main...` touches only Codex paths.
2. `npm run check:ui` passes. Look at `artifacts/ui-previews/` screenshots, phone first.
3. No business logic, fetching, hard-coded routes, or hard-coded strings in the UI.
4. Contracts are used as-is, and contract requests are handled.
5. Privacy: an `ExactAddress` appears only in `ExactAddressPanel`. Masked segments render masked.
6. Then wire it, add e2e tests (`tests/e2e`, projects `app-mobile` and `app-desktop`), and update `docs/ui/progress.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server; UI previews at `/dev/ui` (dev only, 404 in production) |
| `npm run check` | typecheck + lint + unit tests (Vitest; node by default, jsdom by docblock) |
| `npm run test:ui` | Preview harness: every preview at 360 and 1280, axe, screenshots |
| `npm run e2e` | App flows (Playwright) |
| `npm run build` | Production build (must pass) |

## Conventions

- TypeScript strict. Money is integer cents. Timestamps are UTC ISO strings, displayed in America/Chicago via `@/shared/format`.
- Canonical people and money values: `src/fixtures` (mirrors `docs/ui/ui-contract.md` §2–§3).
- Branches: `ui/UI-xxx-*` for Codex work, `feat/*` for yours. Commit or push only when the user asks.
- Keep `docs/blueprint/` authoritative. Change it only when a product decision changes, and say so.
