# The signed-in dashboard (plan 9.9) and the signed-in navigation (plan 9.14, app half)

Owner, 2026-11-18: "compact real dashboard - task lists, show method, few filters, non ai integration (use claude
one and non-claude use one)", and "Organize pages more simple and clearly."

`/app` stops being a landing page of big cards and becomes a working dashboard: what needs you, then your tasks,
offers and bookings as compact lists you can filter, switch to cards or a map, and search, with or without AI.

## 1. Principles

- **Compact.** One row per item (about 60 px), many items on one screen. Cards and the map are a choice, not the default.
- **The app decides, the page shows.** Items, their stage ("needs you", open, booked, done), counts, which tabs a
  person has and whether a map helps all come from the server (`DashboardData`). The UI never filters or decides.
- **Everything in the URL.** Tab, view, status, date, category and keyword: a dashboard can be bookmarked, shared with
  yourself and reloaded. Defaults are left out (`/app` is the plain dashboard).
- **Works without AI.** The keyword search and the filters are the dashboard. AI search ("describe what you need") is
  added on top when Claude is set up and the person's plan includes it (9.13's `aiSearchAccess`).
- **Privacy as everywhere.** Items carry the general area (`PublicLocation`), never an address; the map draws areas.
- **Tokens only.** Surfaces use the `Card` primitive and theme tokens, so 9.8's retune carries through.

## 2. Layout

```
360 (phone)                          768 (tablet, no rail)                1280 (rail + content ≈ 950 px)
┌───────────────────────────┐        ┌───────────────────────────────┐    ┌──────┬────────────────────────────────────────┐
│ Good evening, Jordan       │        │ Good evening, Jordan [$54│$0] │    │ rail │ Good evening, Jordan       [$54 │ $0 →]│
│ 🔔 2 things need you       │        │ 🔔 2 things need you  📅 2 …   │    │      │ 🔔 2 things need you  📅 2 bookings …  │
│ 📅 2 bookings coming up    │        │ Needs your attention           │    │      │ Needs your attention                   │
│ [$54 upcoming │ $0 →]      │        │ ┌ row ─────────────────────────┐│    │      │ ┌ row ─────────────────────────────────┐│
│ Needs your attention       │        │ ┌─────────────────────────────┐│    │      │ ┌────────────────────────────────────┐ │
│ ┌ row ──────────────────┐  │        │ │🔍 Describe the work…  (→)(✨)││    │      │ │🔍 What work …   [Search][✨ Ask AI] │ │
│ ┌───────────────────────┐  │        │ └─────────────────────────────┘│    │      │ └────────────────────────────────────┘ │
│ │🔍 Describe the… (→)(✨)│  │        │ [Bookings 2][Offers 3][Nearby 3]│    │      │ [Bookings 2] [Offers 3] [Nearby 3]     │
│ └───────────────────────┘  │        │ [Status ▾][Date ▾][Category ▾] [☰▦🗺]│ │      │ [Status ▾][Date ▾][Category ▾] [☰ List ▦ Cards 🗺 Map]│
│ [Bookings 2][Offers 3]…    │        │ ┌ 5 rows ──────────────────────┐│    │      │ ┌ 5 rows ───────────┐┌ map (map view) ┐│
│ [Status ▾][Date ▾]         │        │ │ SAT  Assemble a desk   $54.00││    │      │ │ SAT Assemble a desk││  (sticky)      ││
│ [Category ▾]      [☰▦🗺]   │        │ │ 21   Booked · 10:30 · Mueller││    │      │ │ 21  Booked · …  $54 ││                ││
│ ┌ 5 rows (2 lines each) ┐  │        │ └──────────────────────────────┘│    │      │ └────────────────────┘└────────────────┘│
│ │ SAT Assemble a…  $54  │  │        │ Showing 5 of 16  See all bookings →│ │      │ Showing 5 of 16     See all bookings → │
│ │ 21  Booked · 10:30 · … │  │        └───────────────────────────────┘    └──────┴────────────────────────────────────────┘
│ └───────────────────────┘  │
│ Showing 5 of 16  See all → │
└───────────────────────────┘
```
- **Header.** The greeting (H1) and two facts from the counts, side by side and each whole when the line wraps ("2
  things need you", "3 bookings coming up"; audit L9). Helpers who can take work get *earnings at a glance* beside it
  (under it on phones): upcoming and on the way, linking to Earnings. The header has no button of its own: the bar's quick action (Post a task / Find work) is already one tap
  away on every width, and the empty states carry the first step.
- **Order** (audit M17): what needs the person first, then the search right above the lists it searches.
- **Search.** One row on every width: the field, a Search button (keyword, in the URL) and, when AI search is
  allowed, Ask AI, which sends the same words to AI search (icons on phones, words from 640 px). With `needs_plan` or
  `monthly_limit`, one line under the field links to the plan page; with `ai_off`, nothing. AI searches left this month
  show under the field when they're counted.
- **AI answer.** A panel under the search, only after an AI search: what it understood (category, when, area), then
  for someone who needs help a task draft to post (opens the wizard with the words, title and category filled in) and
  up to 3 helpers who do this; for a helper, up to 5 open tasks that match. "See all" links carry the same filters to
  Find helpers or Find work. A line says AI can be wrong. Closing it leaves the dashboard as it was.
- **Needs your attention.** The attention list as before (deadlines first): the three most urgent, the rest behind
  "Show N more" at the list's end (audit M15, M17). When nothing needs you, one quiet line instead of a large empty
  panel. One rule (audit M16): a task needs its client exactly when My tasks says so (new
  offers, a choice due soon, no offers yet), from the same function; the dashboard adds what My tasks doesn't cover
  (messages, bookings, offers sent). A check-in whose start has passed says so ("… was due to start", "Was due at 10:30 AM"; M51).
- **Helper setup / waiting for the city.** A helper who can't send offers yet sees "Finish setting up" first in the
  attention list (one prompt, no separate panel); a helper whose city isn't open yet sees the waiting note (plan 8.4)
  in place of the Nearby list.
- **Lists.** A row of tabs with counts (they are also the "at a glance"), then the filters and the view switch, then
  the items, then "See all … →" to the full page for that list.
  - Phones: the tabs scroll sideways when they don't fit; the three filters and the view switch (icons) wrap, never
    scroll.
  - 768: everything fits on one row each; cards in 2 columns; the map above the list.
  - 1280: filters on the left, view switch on the right; cards in 3 columns; the map to the right of the list, sticky.

## 3. Lists, items and roles

| Tab | Client (needs help) | Helper (can help) | Leads to |
|---|---|---|---|
| Tasks | Your tasks (open, booked, done) with offer counts | – | the task page |
| Offers | Offers waiting on you (on your open tasks) | Offers you sent | the offer / the task in Find work |
| Bookings | Your bookings as the client | Your jobs (bookings as the helper) | the booking page |
| Nearby | Open tasks nearby, only while searching | Find-work matches (open tasks near you) | the public task / Find work |

- **Who has which side.** The mode's side always; the other side too when the person has it (a client who also has a
  helper profile with offers or bookings, or a helper who has posted tasks). Then Offers and Bookings hold both
  directions, each row saying which ("Client: Maya R." / "Helper: Jordan T."), and the attention list holds both
  sides' items. No duplicate tabs.
- **Order and default.** "I need help": Tasks · Offers · Bookings · Nearby. "I can help": Bookings · Offers · Nearby ·
  Tasks. `/app` opens the first.
- **Stage** (the status filter): *open* (taking offers, an offer waiting), *booked* (a booking, a booked task),
  *done* (completed, canceled, expired, declined, withdrawn, and accepted offers, whose booking is under Bookings). *Needs you* marks items with something to do now (new
  offers, payment, approval, a stale offer to confirm again, a booking step). The default, *active*, is open and booked.
- **Date** of an item: a task's window, a booking's start, an offer's proposed start. Filters: any time, today, next 7
  days, next 30 days (the market's calendar); with *done* they look back instead (today, last 7, last 30 days).
- **Category:** the market's categories.
- **Keyword:** every word must appear in the title, the area or the other person's name (own items), or in the title
  or description (Nearby, the board's search). The tab counts show where the matches are.
- **Limits** (audit M15): the next 5 rows per tab (a map shows up to 20 places), "Showing 5 of N", and "See all" to
  the list's own page. On phones a row is two lines: the title and the money, then the status (with a bell when it
  needs you), the start time and the area.

## 4. Views

- **List** (default): one row per item. A date tile (weekday, day), the title, then status, category, area, time and
  the other person; the money on the right (on phones in the details line).
- **Cards:** the same facts as cards in a grid (1, 2 or 3 columns).
- **Map:** the items' general areas on the map (the app's `AreaMap`: drawn first, live when WebGL and tiles work;
  the page scrolls past it, touch needs two fingers). Hovering or selecting a row lights its area and back. Remote
  items are counted under the map. The map is offered only where it helps: when the tab's items are in two or more
  neighborhoods (a client's own tasks at home are not). A map link from elsewhere falls back to the list.

## 5. Empty states

| State | Shows |
|---|---|
| A new client | Tasks: "Post your first task" with the button; Offers and Bookings say how they fill up |
| A new helper | Bookings: "No jobs yet" with Find work; Nearby shows matches (or the setup panel first) |
| Helper waiting for a city | Nearby: the waiting note (who else waits, the waitlist), not an empty list |
| Filters match nothing | "Nothing matches these filters", Clear filters |
| A keyword matches nothing | "No matches for “…”", try other words or Ask AI; a client can post a task with those words |
| Map with nothing to place | "Nothing here has a place on the map", Show the list |
| Nothing needs you | One line: "You're all caught up" |

## 6. AI search ("describe what you need")

- Gate: `aiSearchAccess(db, userId, now)` when rendering (show the box, the remaining count, or the plan link);
  `useAiSearch(db, userId, now)` right before each search (checks and counts in one step). Today's stand-in allows it in
  development and tests only.
- Claude (official SDK, `src/integrations/ai/claude.ts`, structured output) reads the words and returns the intent (get
  help or find work), the category, the keywords, when and the neighborhood if said, and a short task title. Without a
  key, development and tests use a rule-based stand-in with the same output; tests always use it (`tnm_ai_stand_in`).
- The app then searches with that: helpers who do the category (Find helpers' own query) and open tasks nearby (the
  board's query). AI only turns words into filters; results are real rows, never invented.
- The words aren't stored. A refusal or a failure says so and leaves the keyword search working.

## 7. Navigation (plan 9.14, signed-in)

### Before (2026-11-18)

| Place | "I need help" | "I can help" |
|---|---|---|
| Rail and phone dock (primary) | Home · Tasks · Bookings · Messages · Account | Home · Find work · Bookings · Messages · Earnings |
| Rail, under the line (wide screens only) | Community · Saved searches · Find helpers · Saved helpers · Payments · Support | Community · Saved searches · Offers · Availability · My clients · Rewards · Support |
| Avatar menu (every width) | Community · Saved searches · Account · Saved helpers · Payments · Support · theme · language · Sign out | Community · Saved searches · Account · Rewards · Payments · Support · theme · language · Sign out |

Duplicates: Community, Saved searches, Payments, Support and Saved helpers or Rewards were both on the rail and in the
avatar menu on wide screens; Account was a tab and a menu item for clients. Community, where neighbors and open tasks
meet (9.10's portal), was a secondary link.

### After

| Place | "I need help" | "I can help" |
|---|---|---|
| Rail and phone dock (every day) | Home · Neighbors · Tasks · Bookings · Messages | Home · Find work · Neighbors · Bookings · Messages |
| Rail under the line (wide screens); avatar menu below that width | Find helpers · Saved helpers · Saved searches | Offers · Availability · Earnings · My clients · Rewards · Saved searches |
| Avatar menu (every width) | Account · Payments · Support · theme · language · Sign out | Account · Payments · Support · theme · language · Sign out |

- **Five places for every day.** Neighbors (9.10's portal, `/app/community`, the old Community) joins them: it's
  where neighbors' asks and open tasks meet, and both sides come back to it daily. The order is the portal's
  (docs/ui/portal-9.10.md §10): right after Home for clients, after Find work for helpers. One name everywhere
  (audit L15), "Neighbors" (es "Vecinos"), because "Neighborhood" breaks mid-word in the phone dock's five 72 px
  columns at 360 px; Find work is "Trabajos" in Spanish for the same reason (L16).
- **The mode switch** ("I need help" / "I can help") stays in the bar from 640 px; on phones it moves into the avatar
  menu, so the bar is one row there (audit M38).
- **The setup banner** ("Finish setting up to start helping") stays off the setup pages themselves (L17) and off
  Home, whose "Needs your attention" starts with the same step.
- **Each destination has one place on a screen.** The mode's tools sit on the rail under the line on wide screens, and
  in the avatar menu where there's no rail (phones and tablets), never both. Account moves out of the client's dock
  (it was also in the menu); Earnings moves from the helper's dock to the tools (and the dashboard's earnings at a
  glance). Community, Saved searches, Payments and Support were each in two places; now one.
- **Each page one job.** Home is the dashboard (what needs you, your lists); Tasks, Find work, Bookings and Messages
  are the full lists; the tools are the mode's own pages; the avatar menu holds the account's.
