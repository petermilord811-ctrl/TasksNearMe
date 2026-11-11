# UI-024 — Fix: the posting wizard posts without pressing "Post task"

**Status:** ready for Codex · **Branch:** `ui/UI-024-wizard-post-guard` · **Plan first:** no (unattended) · **Depends on:** UI-007 (merged)

## Goal
A small, urgent fix in `PostTaskScreen` (UI-006), found by Claude's end-to-end test of `/app/tasks/new`.

**The bug:** pressing **Next** on the `budget` step posts the task immediately; the person never sees the review step. The ticket requires that nothing is posted automatically.

**Why it happens:** in `src/ui/screens/posting/post-task-screen.tsx`, the footer renders either `<Button type="button" onClick={nextStep}>Next</Button>` or `<Button type="submit">Post task</Button>` in the same position. React reuses the same `<button>` element and only changes its `type`.
1. Clicking Next runs `nextStep()`. Validation resolves in a microtask and `setStep('review')` re-renders synchronously, so the same element becomes `type="submit"`.
2. The browser's default click action runs after the listeners, sees a submit button, and submits the form.
3. `onSubmit` sees `step === 'review'` and calls `onPost`.

## You may edit
`src/ui/**`, `messages/en/ui/**`, and `docs/ui/handoffs/UI-024.md` (last step).

## Fix
- Make sure a click on **Next** can never submit the form. For example, give the two buttons distinct `key`s (`key="next"` / `key="post"`) so React mounts a new element, and call `event.preventDefault()` in Next's click handler.
- Keep `onSubmit` guarded so posting only happens from an explicit **Post task** action on the review step. A stray Enter in a field on another step must also just go to the next step, as it does today.
- Also check the same pattern anywhere else a `type="button"` turns into `type="submit"` in place (other wizards or sheets from UI-004 to UI-007) and fix it the same way.

## Tests
- A regression test: fill every step with `deskDraft`, press **Next** on the budget step, and assert that `onPost` was **not** called and the review step is visible. Then press **Post task** and assert `onPost` was called once.
- Enter in the price field on the budget step goes to review without posting.

## Acceptance
- `npm run check:ui` passes.
- **Last step:** the summary (AGENTS.md format) is written to `docs/ui/handoffs/UI-024.md`.

## Out of scope
Anything else in the wizard.
