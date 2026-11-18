# The neighborhood portal (completion plan 9.10)

The owner (2026-11-18): "I asked about Nextdoor/linkedin portal and craigslist style but not implemented enough (few counts of features and no collaboration between that portal view and list view, combine two of them effectively - think idealistic layout)" and "deep upgrade about portal view - next door and reddit is good example (implement most good features - mainly design layout is important)".

## 1. What changes

Today there are two places. The community feed (`/app/community`, 7.7) holds neighbors' posts only. The task board (`/[market]/tasks`, 7.4) holds open tasks only. Each has its own filters and its own URL, and nothing crosses between them.

The portal makes them one place for signed-in members. It is one stream of what is happening near you: neighbors' recommendation requests, questions, tips and thanks, and the open tasks nearby. It has two views of the same items:

- **Feed:** cards, as on Nextdoor and Reddit.
- **List:** dense rows, as on Craigslist.

Both views use one set of filters in one URL. The route stays `/app/community`, so notification links and bookmarks keep working. The page is called **Neighborhood**.

The public board doesn't change. Signed-out visitors and search engines keep `/[market]/tasks` and its job hubs (tasksnearme-37's pages).

## 2. What we take from Nextdoor and Reddit, and what we leave

| Pattern | Where it comes from | Why it fits local help | In the portal |
|---|---|---|---|
| Neighborhood scope: your own, nearby, the whole city | Nextdoor | Local is the product | A strip of neighborhoods with counts, the portal's channels |
| Communities you switch between | Reddit (subreddits) | Our "communities" are places, and services are a second axis | Neighborhoods in the strip; the service as a filter |
| A composer at the top, with post types | Both | About 30% of Nextdoor's posts are recommendation requests, which lead straight to bookings | An inline composer with five types: the four post kinds, plus Task, which opens the wizard |
| Hot, New, Top | Reddit | People need both "what's lively" and "what's new" | All three sorts, counting positive signals only (§5) |
| Votes | Reddit | No downvotes (7.7): a public score must never be used against a helper's livelihood | Helpful and Thanks on posts and replies; replies ranked by Wilson score |
| Flairs | Reddit | Free-text flair would invite "licensed" claims | Derived flairs only (type, service, neighborhood); tapping one filters |
| Pinned answer | Nextdoor (2026) | Recommendation threads end with one answer | Kept from 7.7, and shown on the feed card |
| Saved posts | Reddit | People come back to a recommendation thread when they're ready to book | Save on every post (migration 0064); helpers also save tasks (find work's marks) |
| Threads | Reddit nests, Nextdoor groups | Deep nesting doesn't read at 360 px | One reply level (7.7); long threads fold after 10 replies |
| Author cards | LinkedIn | Trust comes from what people have done here | A card on every author: role, ID check, neighborhood, member since, and for helpers their rating, tasks done, "recommended by", badges and reply time. All earned, none claimed |
| Right rail | Reddit, Nextdoor | Context without leaving the feed | Your stuff, helpers nearby, active this week, the rules |
| "N new posts" | Reddit, LinkedIn | The page feels alive without moving under the reader | One pill for new posts and new tasks |
| Compact or card density | Reddit | Scanning versus reading | The List and Feed views |
| Empty states that prompt | Nextdoor | A quiet neighborhood needs a first post, not a blank page | Prompts for the first ask, and wider scopes |

**Left out:**

- Downvotes and net scores.
- Awards.
- Crime and safety posts, which 7.7 turns away.
- Off-platform sharing.
- "N people viewing" counts.
- Free-text flair.
- Polls, events and for-sale posts, which aren't local help.

## 3. Layout

### 1280: desktop, with the app's rail on the left

```
┌ app rail ┐┌──────────────── main, 952 px ──────────────────────────────────────────────────┐
│ Home     ││ NEIGHBORHOOD                                         [🔍 Search the neighborhood ]│
│ Neighbor…││ Mueller and nearby                                                              │
│ Tasks    ││ 12 open tasks · 18 posts this week · 9 helpers                                  │
│ Bookings ││ ( Near you 42 )( Mueller 17 )( Windsor Park 9 )( Hyde Park 6 )( All of Austin )( More ▾ )│
│ Messages ││┌──────────── center, ~620 px ────────────────────┐ ┌──── rail, 300 px ─────────┐│
│ …        │││ (MR) Ask your neighbors…                       │ │ Your stuff                ││
│          │││ [Recommendation][Question][Tip][Thanks][+ Task]│ │  Desk assembly · 2 offers ││
│          ││└────────────────────────────────────────────────┘ │  Your post · 3 replies    ││
│          ││ Everything 42  Tasks 12  Recommendations 8  Questions 9 …│  Saved 4                  ││
│          ││ [Hot|New|Top] [Service: All ▾] [Any time ▾]  [Feed|List]│ ├───────────────────────────┤│
│          ││ ┌ post card ────────────────────────────────┐   │ │ Helpers nearby            ││
│          ││ │ (MR) Maya R. ✓ Poster · Mueller · 2h  [Rec]│   │ │  (SK) Sam K. ★4.9 · 6 rec ││
│          ││ │ Who do you recommend for a desk?           │   │ │  [Request]  See all →     ││
│          ││ │ …body…   [Furniture] [Mueller]             │   │ ├───────────────────────────┤│
│          ││ │ ┌ Pinned answer: Priya → Sam K. [Request] ┐│   │ │ Active this week          ││
│          ││ │ ▲ Helpful 4 · ♥ Thanks · 💬 3 · 🔖 Save · Ask for help│ │  1 Who do you recommend…  ││
│          ││ └───────────────────────────────────────────┘   │ │  2 Bagged leaves pickup…  ││
│          ││ ┌ task card ─────────────────────────────── $38/hr┐ ├───────────────────────────┤│
│          ││ │ (NO) Nate O. posted a task · East Austin · 3h │ │ Be kind · exact addresses ││
│          ││ │ Help loading a rental truck · Sat 21, 8–12   │ │ go only to the booked…    ││
│          ││ │ 2 offers · 1 question   [Make an offer] [Save]│ └───────────────────────────┘│
```

- **The app's rail is the portal's left column.** The shell's floating rail (264 px) already plays the part of Reddit's left column: the app's places.
- **The neighborhoods sit at the top of the center column, not in a third column.** A third portal column at this width would squeeze the feed under 460 px: cards would wrap every title, and the list would lose its price column. As a strip under the heading, the neighborhoods are the first control at every width.
- **The rail scrolls with the page,** as Reddit's does. A tall sticky rail with a scroll of its own is worse than one that leaves the feed alone.
- **Width beyond 1280.** If the shell's rail ever collapses to icons on wide pages (f7's shells), a third column can hold the neighborhoods and services with counts. That's listed under §9.

### 768: tablet (the shell's dock instead of its rail)

```
┌──────────────── one column, max 42 rem ────────────────┐
│ NEIGHBORHOOD                    [🔍 Search          ]  │
│ Mueller and nearby · 12 open tasks · 18 posts · 9 helpers│
│ ( Near you )( Mueller )( Windsor Park )( … )( More ▾ )  │
│ ┌ composer ┐                                           │
│ ┌ Your task "Desk assembly" has 2 offers  → ┐  (only when something needs you) │
│ Everything · Tasks · Recommendations · Questions · …    │
│ [Hot|New|Top] [Service ▾] [Any time ▾]       [Feed|List]│
│ card · card · card                                      │
│ ⟷ Helpers nearby (a sideways row of 3–6 cards)          │  after the third item, Feed only
│ card · card · card · card · card                        │
│ Active this week (5 links)                              │  after the eighth item, Feed only
│ …                                                       │
└─────────────────────────────────────── dock ───────────┘
```

### 360: phone

```
┌─────────── 360 ───────────┐
│ NEIGHBORHOOD               │
│ Mueller and nearby         │
│ 12 tasks · 18 posts · 9 helpers │
│ (Near you)(Mueller)(Wind…→ │  sideways, edges fade
│ ┌ (MR) Ask your neighbors… ┐│
│ │ [Rec][Question][Tip]…  → ││  sideways
│ Everything · Tasks · Rec… →│  sideways
│ [Hot|New|Top] [⚙ Filters 2] [▤|☰] │
│ ┌ card, full width ───────┐│
│ │ …                        ││
│      ( ↑ 3 new · Show )     │  fixed under the top bar
└──────── dock (5 tabs) ─────┘
```

On phones, the Filters sheet holds the service, the time, search and Saved, each option with its count.

### List view (every width)

The List view uses the same frame: heading, strip, composer, tabs and toolbar, and on desktop the same rail. Only the center column changes, so switching views never moves the page around the reader.

```
┌ Mueller · 17 ─────────────────────────────────── See all → ┐
│ [SAT│21] Help loading a rental truck  New                $38/hr │
│         Task · Load a truck · 8–12 AM · 2 offers        up to 4.5 h │
│ [ 💬 ]  Who do you recommend for a desk?                     2h │
│         Recommendation · Furniture · 3 replies · 4 helpful      │
├ Windsor Park · 9 ─────────────────────────────── See all → ┤
│ …                                                              │
├ Across Austin · 5 (citywide posts, remote tasks) ──────────────┤
```

- **Grouped by neighborhood** (Craigslist), most items first. Each group shows its first five, with "See all N", which picks that neighborhood.
- **Grouped by day:** Today, Yesterday, then dates in the market's time. This is the default for one neighborhood, or when chosen with `group=day`.
- **Task rows** show when the task is (the day tile), its type, time, offers and price.
- **Post rows** show the type's icon, type, service, replies and Helpful count, and how long ago.
- **Paging.** The list pages by 30 rows, and "Show more" adds the next page under them.

## 4. One set of filters, one URL

`/app/community?area=mueller&category=yard-cleanup&type=question&time=7d&q=leaves&sort=new&view=list`

| Parameter | Values (default left out) | Posts | Tasks |
|---|---|---|---|
| `area` | *(near you)*, `all`, a neighborhood's slug | Near you: posts in your neighborhood, in those within 3 miles, and citywide posts. One neighborhood: its posts only | Near you: tasks in those neighborhoods, and remote tasks. One neighborhood: its tasks only |
| `category` | a service's slug, or `general` | The post's service (`general`: about no one service) | The task's category (`general`: none) |
| `type` | *(everything)*, `task`, `recommendation`, `question`, `tip`, `thanks` | Its kind | Tasks only |
| `time` | *(any time)*, `24h`, `7d`, `30d` | Posted within | Published within |
| `q` | words (max 80) | Every word, in the title or the words | Every word, in the title or the description (the board's keyword rule) |
| `saved` | `1` | Posts you saved | Tasks you saved (helpers) |
| `sort` | *(hot)*, `new`, `top` | §5 | §5 |
| `view` | *(feed)*, `list` | | |
| `group` | *(area)*, `day` | List only, kept in the URL by both views | |
| `page` | 2, 3… | | |

- **Same filters in both views.** Both views read the same query. The Feed/List switch is a link that changes only `view`, so the neighborhood, service, type, time, search and sort carry over. In a list group, "See all" sets `area`. On a card, a service or neighborhood flair sets that filter.
- **Counts on every option** (Craigslist). The strip has a count per neighborhood, the tabs a count per type, the service menu a count per service. Each count leaves its own filter out, so an option never counts itself out.
- **Old addresses still work.** `scope=market` becomes `area=all`, `sort=active` becomes `hot`, and `kind=tip` becomes `type=tip`.
- **No known neighborhood.** If we don't know yours yet (you haven't posted a task, and you don't help in an area), "Near you" is the whole city. The heading then says so.
- **Price filters stay on the board.** With `type=task`, the toolbar links to the full board with the same service, neighborhood and time ("More task filters"). The board's price, time-of-day and few-offers filters stay there.

## 5. Ranking

**Engagement** is how many neighbors responded:

- **Posts:** 2 × Helpful + Thanks + replies.
- **Tasks:** offers + questions (people who stepped up).

| Sort | Rule |
|---|---|
| Hot | log₁₀(1 + engagement) + posted time ÷ 45,000 s. This is Reddit's hot formula with positives only: each 12.5 hours of age costs a tenfold difference in engagement. |
| New | Posted time, newest first |
| Top | Engagement, within the time filter (all time without one) |

Ties go to the newest, then the id. Everything is one SQL query over both tables (`union all`), so paging is exact across posts and tasks.

## 6. How items cross over

1. **Tasks are cards in the feed and rows in the list.** Each shows:
   - the title, when it is and the neighborhood (never anything closer);
   - the price;
   - offers (or "Be the first") and questions.

   The server decides where the card opens:
   - your own task: its page, "Manage";
   - for a helper: the find-work page, "Make an offer";
   - for anyone else: the task's page, "View task".

   Offer counts update live.
2. **"Ask for help."** On your own recommendation request or question, one tap opens the posting wizard (`/app/tasks/new?from=<post>`). The server fills in the post's title, words and service from the post itself; the URL carries no text. Posting links the two (`community_posts.task_id`, migration 0064).
3. **A task links its discussion.**
   - **The post** shows "Posted as a task" with the task's state: offers while it's open, then booked, done or closed. The link stays when the task closes. If a task row ever goes away, the link is set to null (`ON DELETE SET NULL`).
   - **The task's card** and its pages for the client and the helper link back with "From a neighborhood post".
4. **A recommendation names a bookable helper.** The helper card in a reply, or in a thanks post, gets **Request** (the request page) beside the profile. It's never shown to the helper themself.
5. **Flairs filter.** A post's service or neighborhood flair is a link to that filter.

## 7. Privacy and safety

- **Neighborhood level only.** Tasks show their neighborhood, or Remote, never a street, an address or "near X". A post's neighborhood is the one the author chose.
- **The 7.7 rules apply to everything here.**
  - Masking applies when written.
  - Report, block, staff hide and remove, with the audit log.
  - Rate limits by account age.
- **Blocks work both ways.** Posts and tasks by people you blocked, or who blocked you, are left out of every view, count and rail.
- **Saved posts** are read through the same rules. A hidden or removed post, or one by someone blocked, never shows in Saved, and doesn't count toward it.
- **Staff** see hidden posts marked as hidden, in the feed and on the post. Removed posts appear nowhere.

## 8. Live

- **One pill.** New posts arrive as the signed-in stream's community notices, which now carry the service too. New tasks arrive on the market's stream. Those that fit the filters become one pill: "3 new · Show". Nothing is inserted under the reader.
- **Offer counts** on task cards and rows update as they change (7.6's store).
- **A post's page** shows new replies and reactions without a reload (7.7, unchanged).

## 9. Now and later

**Now (this row):**

1. One portal at `/app/community`:
   - Feed and List views;
   - one URL;
   - shared filters with counts (neighborhood, service, type, time, search, saved);
   - Hot, New and Top.
2. The neighborhood strip with counts, and a "More neighborhoods" menu (a sheet on phones) with all of them.
3. The inline composer, with the four post kinds; Task opens the wizard.
4. Posts and tasks in one stream:
   - links that depend on your role;
   - live offer counts;
   - helpers can save tasks.
5. Post cards:
   - flairs that filter;
   - the pinned answer;
   - Helpful and Thanks;
   - replies;
   - Save, Ask for help, and "Posted as a task".
6. Author cards: role, ID check, neighborhood and member since; for helpers also their rating, tasks done, "recommended by", badges and reply time.
7. Request on recommended and thanked helpers.
8. The rail on desktop:
   - your open tasks, posts and saved items;
   - helpers nearby;
   - active this week;
   - the rules.

   On smaller screens these join the feed.
9. One "N new" pill for posts and tasks.
10. A post's page:
    - long threads fold after 10 replies;
    - Save and Ask for help;
    - its task's state;
    - author cards.
11. Every state:
    - empty and first run, with prompts;
    - filtered-empty and Saved-empty;
    - a loading skeleton shaped like the page;
    - hidden posts (staff), and the "verify your phone" note.
12. Spanish throughout.

**Later, and why:**

- **A third column at 1280 for neighborhoods and services.** It needs the shell's rail to collapse to icons on this page. Shells belong to tasksnearme-f7; I'll propose it once this lands.
- **Nested replies.** 7.7 decided on one level, which reads well at 360 px. Quote-in-reply would come first.
- **Staff-pinned announcements.** There's no staff content to pin yet, and a slot with nothing in it adds noise.
- **Neighborhood "Faves" leaderboards and awards (Nextdoor).** They need real completed bookings. Demo data must never be shown as fact.
- **"Ask the neighborhood" (an AI summary of past answers, like Nextdoor's Ask).** It needs Claude, 9.13's plan entitlement, and enough history. Every view here works without AI.
- **Digest and "trending near you" emails.** They belong to the notification owner and need volume first.
- **Several neighborhoods at once.** The strip picks one place. The full board keeps multi-select.
- **@mentions and their notifications; "2 neighbors typing" in threads.**
- **A link from the public board to the portal for signed-in visitors.** That's tasksnearme-37's page; I'll suggest it after this lands.

## 10. Navigation (for the dashboard helper, 9.9 and 9.14; I don't edit the nav files)

- **Rename the entry.** "Community" becomes **Neighborhood** (Spanish **Vecindario**), on the same route, `/app/community`. Its post pages (`/app/community/*`) stay under it. Suggested icon: lucide `MapPinned`, or `UsersRound`.
- **Move it to the primary group, right after Home, for both modes.** It is now where open tasks and neighbors' asks meet, and both clients and helpers come back to it daily.
- **Phones (the dock has five places).**
  - Clients: Home · Neighborhood · Tasks · Bookings · Messages. Account already lives in the avatar menu.
  - Helpers: Home · Find work · Neighborhood · Bookings · Messages, with Earnings in the avatar menu and on the desktop rail.

  The final order is the dashboard helper's call.
- **No change to "Post a task".** The top bar's quick action stays; the composer's Task chip leads to the same wizard.

## 11. Build (contract first)

- **Contracts:** `src/contracts/portal.ts`:
  - the query and its parsing rules;
  - the items (post or task);
  - sections, facets, the rail, page data;
  - handlers: react, save a post, save a task, more.

  `community.ts` gains the post's task link, Saved, "Ask for help", the helper's Request link, and the author's card facts.
- **Fixtures:** `src/fixtures/portal.ts`, covering:
  - many items (posts and tasks, Hot);
  - the List view by neighborhood, and by day;
  - a helper's view;
  - empty (first run), filtered empty, and Saved;
  - a hidden post (staff);
  - "verify your phone";
  - a long thread (30 replies);
  - Spanish content.
- **Server:**
  - `src/modules/community/portal.ts`: the union query, facets, sections, the rail and saves, role-projected;
  - the actions in `src/modules/community/actions.ts`;
  - linking a post to its new task in `postTaskAction`.
- **Screens:**
  - `src/ui/screens/community/portal-screen.tsx`;
  - components in `src/ui/components/portal/`;
  - previews `screen-portal/*`;
  - copy in the `portal` namespace (English and Spanish).
- **Tests:**
  - unit tests for parsing, URLs and ranking;
  - component tests;
  - e2e `tests/e2e/portal.spec.ts` on app-mobile and app-desktop: posting from the composer, sorting, switching views with the filters kept, and "Ask for help" opening a prefilled task draft that links back.
