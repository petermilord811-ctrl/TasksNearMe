# TasksNearMe

Book trusted local help for everyday tasks, starting in Austin, Texas.

- **How we work:** [docs/workflow.md](docs/workflow.md). Claude builds the app, Codex builds the UI from tickets.
- **Product blueprint:** [docs/blueprint/](docs/blueprint/README.md)
- **UI:** design system [docs/ui/design-system.md](docs/ui/design-system.md) · tickets [docs/ui/tickets/](docs/ui/tickets/) · progress [docs/ui/progress.md](docs/ui/progress.md)
- **Agent instructions:** [CLAUDE.md](CLAUDE.md) (Claude) · [AGENTS.md](AGENTS.md) (Codex)

## Run it

Requires Node.js 24+ (26 recommended) and npm.

```
npm install
npx playwright install chromium   # once, for the UI preview harness
npm run dev                       # http://localhost:3000, UI previews at /dev/ui
```

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint + unit tests |
| `npm run test:ui` | Every UI preview at 360 and 1280 px: renders, axe, screenshots in `artifacts/ui-previews/` |
| `npm run check:ui` | Both |
| `npm run e2e` | App flows |
| `npm run build` | Production build |
