# Neighbors and the task lists: UI and logic sweep, 2026-11-24

The owner asked on 2026-11-24: "Deep check and fix uncomfortable UIs and logics about Neighbors and task posts list."
tasksnearme-5b did this pass. tasksnearme-a4 ran the rest of the platform in parallel (`sweep-2026-11-24.md`) and sent
two findings in this area (A2, A5).

## What was checked

| Area | How |
|---|---|
| Neighbors: both tabs, Feed and List, the post page, menus and sheets | Every portal preview at 360 (touch) and 1280, full page. On phones, the sticky bar after a scroll, the Filters sheet, the place sheet and the sort menu. |
| The public board, Find work and My tasks lists | The previews at 360 and 1280. |
| The data behind them | A read-only review of `community/portal.ts`, the portal's links, the board's and Find work's queries and the public task page, each path read end to end. |

## Findings

Severity: H high, M medium, L low. All are fixed in one commit with the decisions of 2026-11-24.

| ID | Finding | Sev | Fix |
|---|---|---|---|
| N1 | On Neighbors a task showed up to three times in one scroll: as a small card, in a "New tasks near you" run of rows, and in the "Open tasks near you" strip or rail card. A post that became a task sat next to its own task. | H | Neighbors is the posts and Open tasks the tasks, with each tab's counts, search, Saved and live pill its own. Neighbors keeps the strip and rail card, which follow the filters the switch carries, and "Posted as a task". |
| N2 | The recommended or thanked helper's card broke at 360 px: Request covered the name ("Sa…") and the rating. | M | The name keeps 10rem, and the buttons wrap under it. |
| N3 | Open tasks on a phone: the first task started about 640 px down (a 190 px composer, Your stuff, "Save this search" and the grouping on rows of their own). The board was the same: about 690 px down. | M | One-line composer on phones; "Save this search" as a bell beside the grouping, or beside the sort and view. Open tasks' first task now starts at about 510 px, with two tasks on a 360 × 800 first screen. |
| N4 | The composer's placeholder was cut mid-word ("What do you need dor"). | L | Ends in "…"; the decorative "+" is gone on phones. |
| N5 | The Filters sheet focused its search box on opening, so the phone's keyboard covered the filters. | M | The sheet opens on itself. |
| N6 | A black "Task" flair sat on every card and row of Open tasks, where everything is a task. | L | Removed. |
| N7 | The search said "Search posts and tasks" on both tabs; the List counted "items"; the live announcement said "posts and tasks". | L | Each tab's own words. |
| N8 | A quiet Neighbors said "It's quiet" even when the place had open tasks, and a search that found no post didn't mention tasks. | L | The strip shows under the empty state, plus "Look for '…' in open tasks". |
| L1 | A task's page said "Make an offer" and its post said "Taking offers" until the window ended, but offers close when it starts. The tap ended in "task closed". | H | Both close at the window's start. |
| L2 | A never-posted request (Book again, a rebooking) reopened by a replacement search was listed on the board, Open tasks, Find work, the home feed and the sitemap, first among the newest. Its page was a 404. | H | Lists show posted tasks only. The request stays private (with a4). |
| L3 | The List in one neighborhood or citywide was paged by the sort but shown by day, so a later page's newer days joined panels above the reader. | M | It pages day by day. |
| L4 | After a refresh (a reaction, a reply, the live pill), what the first page pushed into the second vanished. A post marked Helpful jumped away (Hot, Top), and a post deleted further down stayed. | M | What's shown keeps its place, new items go on top, and later pages are read again. |
| L5 | "Save this search" on citywide Open tasks saved the whole city. | M | Saves remote work. |
| L6 | The price presets left gaps: $49.50 was in neither "Under $50" nor "$50 to $99". | M | A whole-dollar maximum covers its cents (board, Open tasks, live matching, counts). |
| L7 | Counts that didn't match their links: Open tasks' "Saved · N" counted posts too; "Unanswered 0" on Tips opened N asks; "See all 14 open tasks" opened 1 under a search; Saved carried across the switch opened an empty tab. | M | Each count reads what its link opens; Saved stays with its tab. |
| L8 | Find work's "Saved N" counted tasks the Saved list can't show (other markets, blocked posters, started tasks). | L | Counted as listed. |
| A2 | (a4) Reactions from suspended or restricted accounts counted; "Helped N neighbors" counted anyone's Helpful. | M | Refused; only active accounts' marks count. a4 gates Sparks. |
| A5 | (a4) Neighborhood days of paused or suspended helpers showed, with dead links. | M | Fixed at the source by a4 (`dayCardsOf`). |

## Left as is

- The phone's sticky bar (the switch, plus the place, sort and Filters) takes about 150 px while scrolling. It's the way between the tabs, and the e2e bound keeps the first post above 470 px.
- On the Open tasks tab the sort's name can shorten the place's name in the phone bar ("Mueller and nea…"). Both shorten cleanly.
- "Near you" on Open tasks lists remote tasks too, but the board can't save "these neighborhoods plus remote", so a saved search near you leaves remote work out.
