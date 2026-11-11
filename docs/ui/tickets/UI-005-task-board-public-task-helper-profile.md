# UI-005 — Public task board, public task page, helper profile (+ shell follow-up)

**Status:** ready for Codex · **Branch:** `ui/UI-005-task-board-public-task-helper-profile` · **Plan first:** no (unattended) · **Depends on:** UI-004 (merged)

## Goal
Build the last public screens: the task board (`/[market]/tasks`), the public task page (`/tasks/[taskSlug]`), and the public helper profile (`/helpers/[handle]`), plus reusable review and work-sample components. **First**, fix one `PublicShell` issue found while wiring UI-003 (follow-up 1 below).

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`), and `docs/ui/handoffs/UI-005.md` (last step).

## Read first
- `AGENTS.md`
- `docs/ui/design-system.md` §3 (public site), §4.2, §6, §7
- Contracts:
  - `src/contracts/tasks.ts`: `TaskBoardPageData`, `TaskBoardQuery`, `TASK_BOARD_WHEN`, `TASK_BOARD_SORTS`, `PublicTaskPageData`, and `TaskPublicView`.
  - `src/contracts/profiles.ts`: `HelperProfilePageData`, `PublicReviewView`, `HELPER_REVIEW_TAGS`, `WorkSampleView`, `HelperServiceDetail`.
  - `src/contracts/routes.ts`: **`routes.taskBoard(market, query)`** builds filter URLs; `routes.app.findWorkTask(taskId)`; `routes.app.requestHelper(handle)`.
  - `src/contracts/shell.ts`.
- Fixtures: `src/fixtures/board.ts`, `profiles.ts`, `marketing.ts`, `people.ts`, `shell.ts`. Work-sample images are local SVGs in `/public/samples` (Claude's).

## Follow-up from UI-003 wiring (do this first)
1. **`PublicShell` accepts the viewer as a promise.** The prop becomes `viewer: ShellViewer | Promise<ShellViewer>`.
   - When it's a promise, render the chrome and **`children` immediately**. Only the viewer-dependent parts wait: the desktop account area and the mobile menu's account section. Each sits in its own `<Suspense>`, with the signed-out version as the fallback, and is unwrapped with React `use()` in a client component.
   - Never wrap `children` in a Suspense boundary inside the shell.
   - **Why:** the app currently wraps the whole shell in Suspense, so every public page is sent twice (the fallback plus the resolved shell). The production home page is 390 KB.
   - Plain values keep working, so existing previews don't change. Add the preview `shell/public-viewer-promise` (a resolved promise of a signed-in viewer).

## Build

**Screens** (`src/ui/screens/public/`). Each has one H1 and takes `now: ISODateTime` where it shows relative times.

| Screen | Props | Content |
|---|---|---|
| `TaskBoardScreen` | `data: TaskBoardPageData`, `now` | H1 "Open tasks in {market}". A filter bar with: category (All plus each of `data.categories`); when (Any time / Today / This week / This weekend); a "Remote only" toggle; and sort (Soonest / Newest). **Every control navigates to `routes.taskBoard(data.market.slug, nextQuery)` and resets `page`.** Links are best (they work without JS); a select may use `router.push`. Then a results count ("47 open tasks"), the `PublicTaskCard` list, and pagination ("Page 2 of 3", previous and next links built with `routes.taskBoard`). **Empty states:** filters that match nothing ("No tasks match these filters", plus a link to clear them: `routes.taskBoard(slug)`), and no tasks at all ("No open tasks right now", plus Post a task → `routes.app.newTask()`). Add a short privacy note ("Exact addresses go only to the booked helper") and a become-a-helper link |
| `PublicTaskScreen` | `data: PublicTaskPageData`, `now` | Breadcrumb: market → task board (`routes.taskBoard`) → category (`routes.category`). H1 title. Category, area or "Remote", date window, budget, offer count, "Posted 2 hours ago", and the excerpt. A poster card (`TaskPosterSummary`: name, phone verified, member since, rating as a client). An address-privacy note. **When `acceptingOffers`:** primary **Make an offer** → `routes.app.findWorkTask(task.id)`, with the hint "Sign in to see the full details and make an offer." **Otherwise:** a notice ("This task isn't taking offers anymore") and a link back to the board. Similar tasks (`PublicTaskCard`; the section is hidden when empty). A "Need something similar? Post a task" link. No photos, no address |
| `HelperProfileScreen` | `data: HelperProfilePageData` | A header with: initials avatar, name, headline, area and radius ("Travels up to about 6 miles from Hyde Park"), "Remote OK" when `remoteOk`, full `VerificationBadges` (with what each badge means), rating and count, completed count, response time, founding-helper badge, and member since. Primary **Request a booking** → `routes.app.requestHelper(helper.handle)`. Then: bio; services (price "from $50.00" or "$38.00/h, 2 h minimum", plus the description); tools and languages (hide when empty); work samples (`WorkSampleGallery`; hidden when empty); reviews (`ReviewCard` list). When `reviews.length < rating.count`, say "Showing the 4 most recent of 112 reviews". No reviews: "No reviews yet". **Never** a last name, address, phone, or email |

**Components** (export from `src/ui/components/index.ts`):

| Component | File | Props | Notes |
|---|---|---|---|
| `ReviewCard` | `components/reviews/review-card.tsx` | `review: PublicReviewView` | Stars (`RatingStars`), the date ("Nov 8, 2026"), tags as chips (copy per `HELPER_REVIEW_TAGS`), the body when present, the author's initials and name, and the category name |
| `WorkSampleGallery` | `components/people/work-sample-gallery.tsx` | `samples: WorkSampleView[]` | A responsive grid. Open a sample in a dialog with its caption. Use `next/image` with `unoptimized` (the placeholders are SVGs). Alt text comes from `photo.alt` |

Copy namespaces: `taskBoard`, `publicTask`, `helperProfile`, `reviews`.

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-task-board/default`, `/paged`, `/filtered-empty`, `/no-tasks` | `taskBoardPageData`, `taskBoardPagedData`, `taskBoardFilteredEmptyData`, `taskBoardNoTasksData`; `now` = `2026-11-17T15:00:00.000Z` | Filters, pagination, both empty states |
| `screen-public-task/open`, `/assigned`, `/remote` | `publicTaskPageData`, `publicTaskAssignedPageData`, `publicRemoteTaskPageData` | Offer button present or replaced by the notice |
| `screen-helper-profile/sam`, `/jordan-new`, `/lee-remote` | `samProfilePageData`, `jordanProfilePageData`, `leeProfilePageData` | Full profile; new founding helper with no reviews; remote OK |
| `review-card/full`, `/tags-only` | `samProfilePageData.reviews[0]`, `[2]` | — |
| `work-samples/three` | `samProfilePageData.workSamples` | — |
| `shell/public-viewer-promise` | A resolved promise of the signed-in shell viewer from `shell.ts` | Follow-up 1 |

## Tests
- `PublicShell` with a **never-resolving** viewer promise: `children` render immediately, and the account area shows the signed-out fallback.
- Board: the "Today" control links to `/austin/tasks?when=today`. Choosing a category from page 2 drops `page`. Pagination links to `page=3` and back to the URL without `page`. Both empty states render their CTA.
- Public task: the offer button links to `/app/find-work/tsk_desk`; there's no offer button when `acceptingOffers` is false; no street or house-number text appears.
- Helper profile: the request link is `/app/helpers/sam-k/request`. The review count note shows "4" and "112". The tools section is hidden when `tools` is empty.
- `ReviewCard` maps every `HELPER_REVIEW_TAGS` entry to copy (iterate the constant).
- Banned-word test for the new namespaces.

## Acceptance
- Every item in **Build** and the follow-up exists, and every **State to preview** is registered.
- `npm run check:ui` passes (previews at 360 and 1280, axe clean, no runtime errors).
- No imports outside the allowed areas (lint).
- **Last step:** the summary (AGENTS.md format, including contract requests) is written to `docs/ui/handoffs/UI-005.md`.

## Out of scope
Saving helpers (UI-015), the request-a-booking flow (UI-010), the helper's task view and offer form (UI-009), map views, and helper photos (avatars stay initials for now).

## Claude wiring notes (after review)
- Public layout: pass `getPublicShellViewer()` to `PublicShell` as a promise, and drop the outer Suspense fallback that duplicates the page.
- Tasks module: schema and public projections (scrubbed excerpt, area only), board query parsing from `searchParams` (the board page is dynamic per query), and the public task page by slug.
- Helper profile query (services with descriptions, published reviews, work samples). `generateStaticParams` for active helpers and open tasks.
