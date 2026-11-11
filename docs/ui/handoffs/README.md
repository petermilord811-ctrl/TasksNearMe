# UI handoffs

Codex's last step on every UI ticket is to write its summary here as `UI-xxx.md`, the same id as the ticket.

**That file is the "done" signal.** Claude watches for it with `npm run wait:handoff -- UI-xxx`, which runs in the background while the Claude Code session is open. When the file appears and stops changing, Claude reviews and wires the ticket automatically and then notifies you.

Format (see `AGENTS.md`, Definition of done):

1. **Built:** components and screens (paths) and preview ids.
2. **Contracts used:** props and handlers, and from which files.
3. **Message namespaces** added or changed.
4. **Dependencies added**, and why.
5. **Contract requests**, or "none".
6. **Known gaps or follow-ups.**
7. **Previews to review first.**

Follow-up fixes in the same Codex conversation end by appending a `## Follow-up N` section to the same file.
