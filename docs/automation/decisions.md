# Autopilot decisions

Non-obvious choices made without asking, with the reason and the alternative. Newest last.

| Date | Decision | Why | Alternative |
|---|---|---|---|
| 2026-11-10 | Codex runs unattended via `codex exec --approve-for-me` (workspace-write sandbox with network) in a sibling git worktree `../TasksNearMe-ui`, on port 3100, one ticket at a time | Claude and Codex can work in parallel without editing the same files or fighting over port 3000; the sandbox limits what Codex can touch | `--dangerously-bypass-approvals-and-sandbox` (no sandbox; rejected as unnecessary risk) |
| 2026-11-10 | Claude updates `docs/ui/progress.md`; Codex writes only its handoff file | Avoids merge conflicts between the two worktrees | Codex edits its own progress row (caused conflicts in parallel runs) |
| 2026-11-10 | The autopilot commits locally to `main` after green checks; never pushes | The user asked for fully autonomous building; local commits are safe checkpoints | Ask before each commit (would stall the run) |
