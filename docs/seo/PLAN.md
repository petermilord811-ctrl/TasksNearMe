# SEO plan: getting TasksNearMe found on Google

Written 2026-11-14 by tasksnearme-b7 for the owner, from four research briefs (the search results for our target
queries; how TaskRabbit, Thumbtack, Angi, HomeAdvisor, Handy and Airtasker win; how Craigslist, Airtasker, Upwork,
Nextdoor and Indeed handle listings and Google Jobs; Google's current rules) and an audit of the live site. It is also
the working plan for the sessions that build it. §5 is the backlog, §7 the schedule, §8 the owner's checklist.

## 1. The goal, and what is realistic

**The owner's goal:** tasksnearme.com on page 1 or 2 of Google for "tasks near me" within days, as automatically as
possible.

| Query | Realistic, once Google has indexed the site | What decides it |
|---|---|---|
| "tasksnearme", "tasks near me austin" | Page 1 within days to two weeks | Being indexed; Austin pages; first brand mentions |
| Austin long tail: "computer help for seniors austin", "ikea pax assembly austin", neighborhood + service, Spanish service searches, cost questions | Page 1 within weeks | Real local pages with data the incumbents lack |
| "tasks near me" (national) | Page 2 within weeks is plausible: the pages ranking today are weak (Taskrabbit's thin /near-me hub, a ZipRecruiter list, a GigNGo article) | Links, brand signals, serving both intents |
| Head terms: "furniture assembly austin", "moving help near me", "handyman austin" | Months | Links, reviews, real supply. The map pack is closed to marketplaces |

Facts that shape everything:
- **Nobody can promise a position.** Google: "No one can guarantee a #1 ranking on Google"
  ([source](https://developers.google.com/search/docs/fundamentals/do-i-need-seo)). Ahrefs (2025): 1.74% of new
  pages reached the top 10 within a year; the average #1 page is five years old
  ([source](https://ahrefs.com/blog/how-long-does-it-take-to-rank/)). Only ads reach page 1 in days.
- **The brand name is the generic phrase.** Search engines split "tasksnearme" into "tasks near me", and Google gives
  exact-match domains no special credit. The brand starts to lead to the site once Google recognizes it as a brand:
  links, mentions, the site-name markup.
- **"tasks near me" has two intents.** Half the results serve people who want help (Taskrabbit), half people who want
  paid gigs (ZipRecruiter, Indeed, Care.com, Airtasker's job hubs). We serve both: hire-side pages and earn-side
  pages.
- **Google is mid core update** (rolling since 2026-11-10); rankings move for everyone until a week after it ends.

## 2. Where we stand (2026-11-14)

**Live:**
- `robots.txt`, `sitemap.xml` (each page in English and Spanish, with hreflang), canonical links.
- Open Graph and X cards with a share image per language.
- JSON-LD: Organization, WebSite, BreadcrumbList, Service, ProfilePage, Article.
- Titles that name the queries ("TasksNearMe: tasks near me, done by trusted local helpers"; "Open tasks near you in
  Austin"; "Earn money doing tasks near you"; Spanish "trabajos" for earning, "ayuda" for hiring).
- One switch in code, `LIVE_SITE_INDEXING` (`src/shared/search-indexing.ts`), at `site`: the site's pages are indexed,
  task pages and helper profiles (sample data) are not. Caddy only adds a second noindex on /app, /admin and /api.

**In the next ship (this run):**
- IndexNow: Bing, Yandex, Seznam, Naver and Yep hear about new and changed pages every 15 minutes.
- Supply-gated pages: only Austin (the launch market) and live markets are indexed; the 14 prelaunch demo cities answer
  noindex and leave the sitemap.
- `scripts/seo/google.mjs` (Search Console and Indexing API), waiting for the owner to grant the service account access.

**Measured:**
- Server response 15–25 ms (prerendered): excellent.
- JavaScript: 20 files, 455 KB compressed on every page, category pages included. React and Next make up most of it;
  form validation (zod, pulled in through `@/contracts`) rides along on public pages (§5, S9).
- Visible text: home ~1,100 words, a category page ~510, the board ~680.

**The biggest risk, resolved 2026-11-17 (§6.1):** public pages showed sample people with fake ratings, reviews and
"ID verified · Background checked" badges, and Google could index those pages. The owner chose (a): only signed-in
testers see the sample marketplace; the public and search engines see real rows only.

## 3. Research

### 3.1 The search results we compete in

_Source: search-results brief. Google's own results page couldn't be read (JavaScript only); rankings come from a
US search index and Google Autocomplete, so SERP features are inferred._

- **"tasks near me"**: low volume; Autocomplete pads it with "activities near me". Ranking pages:
  taskrabbit.com/near-me (a thin hub of category links), ziprecruiter.com/n/Tasker-Jobs-Near-Me,
  gigngo.org/articles/task-jobs-near-me, airtasker.com/us/jobs/handyman/new-york-ny/, care.com/odd-jobs.
- **Lookalike competitors already do SEO:**
  - GigNGo: articles ranking for "tasks near me", "paid tasks near me" and "taskrabbit alternative austin".
  - task.coop: "Built for Austin"; ranks for "tasks near me austin".
  - Airtasker US: thin Austin pages that list tasks from other states.
- **Category head terms** ("furniture assembly austin", "help moving austin", "handyman austin") belong to Yelp,
  Thumbtack, Taskrabbit, Angi, U-Haul and local companies, with the map pack on top.
  Google Business Profiles exclude "lead generation agents" and "online-only businesses", so we win in the organic
  results, not the map ([eligibility](https://support.google.com/business/answer/13763036)).
- **Weak spots we can win:**
  - Austin computer and phone help: only small shops and nonprofits rank.
  - Neighborhood + service, e.g. "yard cleanup hyde park austin".
  - Single items: "ikea pax assembly austin", "crib assembly austin".
  - Cost questions: "how much does furniture assembly cost in austin".
  - Spanish: "armado de muebles austin tx" returned no Spanish Austin page at all.
- **Autocomplete shows what people type:** "odd jobs near me that pay cash / same day pay / app", "someone to help me
  move furniture / declutter / pack", "computer help for seniors near me / at home", "how much does ikea furniture
  assembly cost", "trabajos de limpieza de casas en austin tx".
- **Spanish wording:** "tareas" reads as homework ("tareas dirigidas"); job seekers search "trabajos". The rule is in
  `docs/ui/spanish-glossary.md`, "Search and acquisition headings".

### 3.2 How the leaders win

_Source: competitor brief (raw HTML, robots.txt and sitemaps; Thumbtack and most of Angi blocked the fetch)._

| What they do | Example | What we take from it |
|---|---|---|
| City × service pages are the main landing pages: server-rendered, ~1,100 words with live local data (helper count, helper cards with first name + initial, stars, tasks done; a cost FAQ; reviews; how it works; related links; a few hundred hand-written words with local color) | [taskrabbit.com/locations/austin/assemble-furniture](https://www.taskrabbit.com/locations/austin/assemble-furniture) | `/austin/[category]` is our money page (S3) |
| Pages only where there is supply: ~70 metros get 74–79 services, suburbs 10–18, cities without supply 404; close variants redirect (bed-assembly → assemble-furniture) | TaskRabbit's 6,745 geo URLs | Done (S2) |
| A city hub with Service + OfferCatalog | taskrabbit.com/locations/austin | Done |
| Helper profiles kept out of search (TaskRabbit noindex, Airtasker robots-blocked) | taskrabbit.com/profile/… | Ours enter search only with a completed task or a review (S2) |
| Earn-side hubs: "Furniture Assembly Jobs in Austin", 9 newest open tasks with "Make an offer", "Last updated on …", earnings estimates, nearby areas | [airtasker.com/us/jobs/furniture-assembly/austin-tx/](https://www.airtasker.com/us/jobs/furniture-assembly/austin-tx/) | `/austin/tasks/[category]` (S4) |
| Cost guides | taskrabbit.com/cost-guides/assemble-furniture; HomeAdvisor and Thumbtack cost pages | `/austin/[category]/cost` (S5) |
| Sitemaps split by page type (an indexing report per type) | Airtasker's 15 sitemaps | When listings are indexed (launch) |
| Authority through partners and data | TaskRabbit × IKEA (book assembly at checkout); Angi on Walmart and Crate & Barrel; Thumbtack inside ChatGPT and Claude; Angi's yearly spending report | §8 |

**Their mistakes to avoid:**
- Numbers that disagree: Taskrabbit's furniture assembly price reads $34, $43 or $45 an hour depending on the page. We
  use one price function everywhere.
- Star ratings on category and home pages, which break Google's review rules (self-serving, about a category).
- Extra hostnames and parameter URLs in the index (elb2.taskrabbit.co.uk, next-www.thumbtack.com, `?zip_code=`).

**Google's changes in 2025–26:**
- FAQ rich results left Search on 2026-05-07: FAQ text still helps readers and AI answers, but the markup earns nothing.
- Breadcrumb rich results show on desktop only since 2025-01-22.

**Spanish is an open gap:** no competitor has US Spanish pages (Taskrabbit's hreflang covers only es-ES and ca-ES; Angi,
Handy and Airtasker US have no /es/ URLs).

### 3.3 Listings and Google Jobs

_Source: listings brief, quoting [Google's JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
(updated 2026-09-08), the [Indexing API docs](https://developers.google.com/search/apis/indexing-api/v3/quickstart)
and the live pages of Airtasker, Craigslist, Upwork, Nextdoor and Indeed._

**Can tasks be gig job postings? Yes, with conditions.** Google's rules don't exclude one-off contractor tasks posted
by private people:
- **hiringOrganization**: "If the organization is hiring anonymously (for example … an employer directly on your
  platform), use the confidential value." Never the poster's name, and never TasksNearMe: we aren't the hirer, and
  naming the platform as employer may undercut the contractor model (a question for counsel).
- **jobLocation**: city-level is accepted; only `addressCountry` is mandatory. No street address, no `geo`.
- **Gig work**: the docs name "the 'gig economy'" and offer `employmentType: CONTRACTOR`.

**What breaks it, from the content policies and manual actions:**
- fake or non-existent jobs;
- location data that doesn't match;
- incomplete descriptions;
- expired postings left up;
- details hidden behind a login;
- "job requests" (people offering to work, i.e. our helper profiles);
- any payment required from applicants.

The penalty is that the markup is ignored; the page can still rank. So the demo marketplace must never carry
JobPosting.

**Indexing API:**
- For JobPosting pages only. Abuse "may result in access being revoked". Mueller (2025): "I'd just use it properly,
  or not use it".
- 200 publish requests a day per project.
- `URL_UPDATED` when a task opens or changes, `URL_DELETED` when it closes (the page must then be noindex or 404/410).

**How the others handle listings:**
- **Airtasker:**
  - Open task pages: `index, follow, unavailable_after`, titled "Trampoline Assembly, Austin TX 78723, USA - $300",
    with no JobPosting.
  - Closed task pages: 200 with `noindex, follow` and a status banner.
  - Its sitemaps list hub pages, not tasks: 16,398 "<Category> jobs in <suburb>" pages.
- **Craigslist:** JobPosting only on its jobs section, never on gigs; expired postings 404; daily sitemaps per city and
  category.
- **Nextdoor:** posts are noindex; only city and "ask" hubs are indexed.
- **Upwork:** blocks job pages and indexes skill and city hubs.
- **Nobody marks up one-off household tasks today.** Only employment-style postings carry markup (Indeed Flex,
  Craigslist jobs). That makes Google Jobs an open lane, if we follow the rules exactly.

### 3.4 Google's rules today

_Source: rules brief; Google Search Central documentation unless marked._

**Indexing a new domain:**
- "It can take a few weeks for Google to notice a new site"
  ([source](https://developers.google.com/search/docs/fundamentals/get-on-google)).
- Request indexing has a daily limit, reportedly about 10; repeating a request "won't get it crawled any faster".
- Sitemaps are "merely a hint"; lastmod is used only when it's accurate; the sitemap ping endpoint is gone.
- There is no "sandbox" by policy (Mueller): rankings of new pages swing until Google has signals.

**Spam policies that bind a local marketplace:**
- **Scaled content abuse:** pages made mainly to rank, by automation or by hand; AI-written text is fine if it's
  checked and adds value.
- **Doorways:** "pages targeted at specific regions or cities that funnel users to one page", and "substantially
  similar pages that are closer to search results than a clearly defined, browseable hierarchy". Mueller on 1,300
  city pages: "That sounds like doorway pages". A city × service page is acceptable when it shows real local supply
  and facts, sits in the normal navigation, and covers a market we serve.
- **User-generated content** (guidance updated 2026-10): noindex posts from users without a track record, mark their
  links `rel="ugc"`, use CAPTCHA and moderation.
- **Fake reviews:** "Don't include fake or undisclosed incentivized reviews"
  ([review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)). The FTC's
  rule (16 CFR 465, since 2024-10-21) bans fake reviews and testimonials a business disseminates
  ([FTC](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)).

**"Near me":**
- Google infers local intent and the searcher's location.
- Mueller: make the location "very clearly defined on your pages".
- Local results rank by "relevance, distance, and prominence" (links, reviews); there's no way to pay for it.

**Page experience:**
- Core Web Vitals: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, at the 75th percentile. "There is no single signal", and
  relevant content still ranks with a weak experience.
- Indexing uses the smartphone Googlebot only.
- Server rendering "is still a great idea"; streamed React Server Components are rendered fine (Vercel/MERJ).
- A `<canvas>` is never the LCP element, and text drawn only on a canvas can't be indexed.

**Structured data:**
- Supported: Article, Breadcrumb (desktop), Organization (logo ≥ 112 px), ProfilePage, Review snippet, LocalBusiness,
  Event, Product, JobPosting.
- Gone: HowTo, the sitelinks search box, FAQ rich results.
- The site name comes from WebSite markup; Google rarely picks a generic name, so list the domain last in
  `alternateName` (done).
- Review stars need LocalBusiness, Organization or Product as the reviewed item (not Person or Service), ratings from
  users, never aggregated from elsewhere.

**AI Overviews and AI Mode:** no special requirements: index the page and allow snippets; no llms.txt.

**Bing:**
- Bing Webmaster Tools imports sites and sitemaps from Search Console.
- IndexNow: Bing, Naver, Seznam, Yandex, Yep and Amazon; send changed URLs.
- Bing feeds DuckDuckGo, Copilot and ChatGPT search; ChatGPT search needs `OAI-SearchBot` allowed (our robots.txt
  allows everyone).

## 4. Strategy

1. **Get indexed fast and completely:** sitemap, IndexNow, Search Console (sitemap submission, inspection, daily
   queries), the owner's "Request indexing" clicks, strong internal links.
2. **Austin first, supply-gated:** national pages + Austin's pages now; other cities when they open; listings and
   profiles when they're real. No page without real local substance in the index.
3. **Both intents at every level:** hire-side pages (city, category, cost guides) and earn-side pages (board, category
   job hubs, becoming a helper), cross-linked.
4. **Spanish as a moat:** fully Spanish /es pages for every indexable page; "trabajos" on earning pages.
5. **Real data is the content:** helper counts, open tasks, one price function for every price, reviews only when
   real, local details written for Austin.
6. **Structured data that Google allows:** breadcrumbs, Service and price ranges, the site name and logo, Google Jobs
   for real tasks at launch. No ratings on hubs, no FAQ markup.
7. **Page experience:** keep public pages light (S9).
8. **Authority from the owner:** links and mentions in Austin, partners, profiles (§8).
9. **Measure daily, iterate weekly** with Search Console data.

## 5. Backlog

Owners: **b7** (this SEO run), **UI** (the session that owns the screen: a9 public screens, 83 landing and shell,
d4 task board and task page), **owner** (§8). Status as of writing.

### S1 Indexing and discovery
| ID | Item | Owner | Status |
|---|---|---|---|
| S1.1 | robots.txt, sitemap.xml with hreflang, canonical and language links | b7 | Live |
| S1.2 | IndexNow: job runner announces new and changed sitemap pages every 15 min; `scripts/seo/indexnow.mjs` after deploys | b7 | Live (4e4a1cf; 42 pages accepted) |
| S1.3 | Search Console: submit sitemap, inspect key pages, daily report of queries, positions and indexed pages (`scripts/seo/google.mjs`) | b7 | Live since 2026-11-17: sitemap read (62 pages, 0 errors), 54 indexed, 8 newest discovered; first queries at positions 13–96 |
| S1.4 | Request indexing for the ten most important URLs | owner | §8 |
| S1.5 | Bing Webmaster Tools: import from Search Console | owner | §8 |
| S1.6 | Footer links to Austin's category pages and the board (every indexable page within 3 clicks) | UI (83) | Live (f13f131) |

### S2 Supply-gated pages
| ID | Item | Owner | Status |
|---|---|---|---|
| S2.1 | Market pages (city, board, categories) indexed once `live`, the launch market from the start (Gainesville since 2026-11-17; Austin is paused, its pages 404 until it opens); others noindex + out of the sitemap | b7 | Live (4e4a1cf) |
| S2.2 | Helper profiles indexed (in `on`) only with a completed task or a published review | b7 | Live (4e4a1cf); listed only in `on` |
| S2.3 | Task pages indexed (in `on`) only while open, public and from a poster with a verified phone; closed ones noindex, follow with a banner (already the board's rule) | b7 | Rule in place; poster check at launch |

### S3 Category pages, the money pages (`/austin/[category]`): live (bbdd997)
- `CategoryPageData.seo` (`CategorySeoContent`), filled in the page's language by `src/modules/seo/category-content.ts`:
  - **counts**: real helpers offering the service in the city and its open tasks, never sample data (`isRealRecordId`);
    the page shows the line only above zero;
  - **questions people ask**: the cost (from the same price guidance the page shows, so the numbers never disagree),
    how helpers are checked (with the background check for in-home services), remote work where allowed, and two
    answers taken from the help center's own summaries (when you're charged, who sees your address), so the two
    never disagree. Rows open in place; no FAQ markup;
  - **the city guide**: 180–270 words per service written for Austin, in English and Spanish
    (`content/local/austin/*.md`, `content/local/es/austin/*.md`), with checked local facts: the IKEA store in
    Round Rock and its pick-up points; the spring live-oak leaf drop; the City's yard-trimming rules (paper bags,
    weekly on trash day, bundles under 5 feet); no oak pruning February–June (oak wilt); summer heat; August lease
    turnover and UT move-in;
  - **related links**: the city's other services, its open tasks, pricing.
- Layout (a9's): counts under the H1; the guide after included/excluded; questions after the helpers; related links
  last. Previews `screen-category/furniture-seo` and `screen-category/moving-seo-empty`.

### S4 Earn-side hubs (`/austin/tasks/[category]`): live (bbdd997)
"Furniture assembly jobs near you in Austin" / "Trabajos de armado de muebles cerca de ti en Austin": the board on one
category, with its own title and heading, an intro that says what the work is (from the category's scope: moving help
is the lifting, not the truck) and how offers and addresses work, and breadcrumbs (TasksNearMe › Austin › Open tasks ›
the hub). The other filters stay URL parameters and canonicalize to the hub. `routes.taskBoard(market, { category })`
builds the hub's address, so every category link on the board, and the board's filters on a hub, lead to hubs;
src/proxy.ts answers the board's older `?category=` addresses with a permanent redirect (`src/shared/task-hub.ts`).
In the sitemap after each category's cost guide, dated by the category's newest task; linked from the category page
and its cost guide; noindex outside indexable markets. The data is d4's `loadTaskBoard(…, { category, heading })`.

### S5 Cost guides (`/austin/[category]/cost`): live (bbdd997)
"How much does furniture assembly cost in Austin?" (the same words as the category page's question, one server string):
the typical range from the same price guidance as the category page; what a poster pays and what a helper earns at
each end, worked out by the fee engine from the market's published policy (`getCostGuideData`); what changes the price
(per service); how to get an exact price; related links. English and Spanish; in the sitemap after each category page;
linked first in the category page's related links; BreadcrumbList; noindex outside indexable markets. The path lives in
`src/modules/seo/paths.ts` until the board's route changes settle (then `routes.costGuide`).

### S6 Google Jobs for real tasks (built now, off until launch)
- JobPosting on single open task pages only, one canonical copy (the English URL), filled per §3.3:
  - title: the task's title as shown; description: the full public details plus pay, date window, the helper fee,
    "independent contractor", "general area only, address after booking", and how to offer;
  - datePosted and validThrough (the window's end), plus `unavailable_after`;
  - hiringOrganization "confidential";
  - jobLocation: the task's city, region and country, no street;
  - employmentType CONTRACTOR; baseSalary only for hourly tasks (HOUR); directApply false; TELECOMMUTE for remote
    tasks, with Texas as the applicant location.
- Indexing API `URL_UPDATED` when a task opens or changes, `URL_DELETED` when it closes, from the server (credentials
  in its settings at launch). Built with the switch at launch, not before: its default quota is 200 notifications a
  day, so it needs a persisted log of what was sent (a small table), or every deploy would re-announce every open
  task. `scripts/seo/google.mjs notify-job` covers single pages by hand meanwhile.
- **Switches on only when all of these hold** (`JOB_POSTINGS_ENABLED` and `jobPostingEligible` in
  `src/modules/seo/job-posting.ts`, built and tested this run, off):
  - `LIVE_SITE_INDEXING` is `on`, the market is live, and the task is real, open, public and moderated (sample ids
    never qualify: `src/shared/sample-data.ts`);
  - the task page shows the **full** description publicly, contact details masked. Today the public page shows a
    160-character excerpt, and the markup may only say what the page shows: a privacy and product call for the owner;
  - posters are told at posting time that an open task may appear in Google job search (posting-flow notice and
    privacy policy);
  - applying stays free for helpers (no offer fees; background checks not paid by helpers, blueprint F9 open).

  b7 built the markup and the switch; the notice, the policy text and the full-description decision go to the owner
  and UI.

### S7 Spanish
- Every indexable page fully Spanish at /es (category names translated by a9; "trabajos" on earning pages, per
  `docs/ui/spanish-glossary.md`); city guides in Spanish (S3); Spanish cost guides and job hubs with the English ones.
- **Links inside Spanish pages should stay in Spanish.** Today a page at `/es/austin` links to `/austin/yard-cleanup`,
  `/pricing` and so on (only the language switch says `/es/…`). People keep Spanish through the language cookie, but
  crawlers follow those links to the English pages, so Spanish pages pass no link value to each other. Proposed for
  the UI owners: a locale-aware link (next-intl's `createNavigation` with `localePrefix: 'as-needed'`, or a small
  wrapper over `next/link`) so that on Spanish pages every internal `href` carries `/es`. Hreflang and the sitemap
  already lead Google to each Spanish page meanwhile. Done by 83 in d68d1f9: `LocaleLink` and `localeHref`
  (`src/ui/lib/locale-link.tsx`) in the public shell, the footer and the landing; the category page's SEO sections and
  the cost guides use it too (b7); the other public screens switch with a one-line import change (a9).

### S8 Structured data
| Page | Markup | Status |
|---|---|---|
| Home | Organization (logo, areaServed United States), WebSite (alternate names incl. the domain) | Live |
| City | BreadcrumbList, Service + OfferCatalog | Live |
| Category | BreadcrumbList, Service + AggregateOffer price range; ItemList of helper profile URLs once profiles are indexed | Live / at launch |
| Board, job hubs | BreadcrumbList | Live |
| Cost guide | BreadcrumbList (no Article: the page has no author or date of its own, and Article earns no rich result outside news) | Live |
| Task | BreadcrumbList; JobPosting at launch (S6) | Live / at launch |
| Helper profile | ProfilePage (no photo, area or reviews) | Live |
| Help article | BreadcrumbList, Article | Live |

Never: ratings on home, city or category pages; FAQPage; addresses, contact details or last names.

### S9 Page experience
Measured on 2026-11-14 with `node scripts/seo/page-weight.mjs` (the live site, before): every public page loaded the
same 20 scripts, 445 kB of gzipped JavaScript (1.4 MB raw), /pricing as much as the home page. Barrel imports were the
cause: a route importing `PricingScreen` from `@/ui/screens/public` got every public screen's client code (the
landing's Motion animations and WebGL town, the waitlist form), and the public layout's `@/ui/shells` brought the app
and admin shells.
- Done (b7, 4d20013): routes import screens, components and shells from their own files. In the e2e build /pricing
  is about 322 kB gzipped (client modules 48 → 29); the other public pages have 21–22 client modules, none from the
  landing.
- Asked of 83: the shell's client components import values from `@/contracts/locale` and `@/contracts/routes`, not
  the `@/contracts` barrel, which brings zod and every form schema (42 kB gzipped) to every page; per-file imports from
  `@/ui/motion`.
- Asked of a9: the pricing and become-a-helper screens import from `@/ui/components` per file (the barrel brings the
  offer card, the payment picker and the bank dialog).
- Budget, checked after each build with page-weight.mjs: public pages other than home at most 250 kB of gzipped JS.
- Lazy-load the maps below the fold; no text drawn only on a canvas.

### S10 Measurement
- Daily Search Console report (once access is granted): indexed pages by type, queries with impressions, average
  position for "tasks near me", "tasks near me austin" and each category, clicks.
- Weekly: retitle pages whose queries show impressions but few clicks; add pages for queries with impressions and no
  good page.

## 6. Risks and guardrails

1. **Sample people and fake ratings on public pages: resolved 2026-11-17, the owner chose (a).** The demo marketplace
   and the base seed showed fictional helpers with "ID verified · Background checked", star ratings, reviews and task
   counts on public pages, and Google could index them: the "fake reviews" both Google and the FTC prohibit.
   The options were (a) the sample marketplace only for signed-in testers, the public and Google seeing real data with
   empty states until launch; (b) visible "sample" labels; (c) accepting it until launch.
   Done (completion plan 5.24, `src/shared/sample-data.ts`): a row is real when its id is `<prefix>_<32 hex>` (`newId`);
   demo ids contain `_demo_` and seed ids are fixed (`usr_jordan`, …). Without a session cookie, public pages read real
   people and tasks only (and everything counted from them); signed-in testers read every row. Search engines always get
   the public's rows: the sitemap, IndexNow, JSON-LD and task and profile titles. In development and the e2e build every
   row is seed data, so nothing is hidden there. Logged in `docs/automation/decisions.md` and `blocked.md`.
2. **Doorway pages:** no city, neighborhood or task-type page without real local supply and facts (S2). No synonym
   pages: one URL per service and city.
3. **User-generated content:** Q&A and task text get `rel="ugc nofollow"` on links, contact masking and moderation;
   new posters' tasks need a verified phone before they're indexed.
4. **Privacy:** never addresses, contact details or last names in public HTML, metadata or JSON-LD; Google Jobs uses
   the city only.
5. **Google Jobs:** only real, open, consented tasks; never the demo marketplace; expire on close; never paid
   applying. Manual actions only strip the markup, but they're worth avoiding.
6. **Indexing API:** JobPosting pages only, within quota.
7. **Language:** one canonical per language; never rewrite a page by the visitor's IP.

## 7. Schedule for this run (2026-11-14 to 2026-11-16)

| When | What | Ships |
|---|---|---|
| Day 0 | Research; plan; IndexNow; supply gating; Search Console CLI; Spanish titles | Ship 1 |
| Day 0–1 | Category pages: data, Austin text and FAQ copy (S3); job hubs (S4); cost guides (S5) | Ship 2 |
| Day 1 | Google Jobs markup and Indexing API notifications, switched off (S6); measurement report (S10) once access is granted | Ship 3 |
| Day 1–2 | Fixes from Search Console data; S9 proposals to the UI owners; final report to the owner | Ship 4 |

Each ship runs the full e2e suite in CI before it deploys; after each, `node scripts/seo/indexnow.mjs`.

Status, 2026-11-14 midday: Ship 1 (4e4a1cf) is live. Ships 2–6 were each stopped by CI on a regression from the
parallel sessions' work, so nothing broken reached the site: duplicated server-rendered content (fixed in 21141ce), a
reverted marketing hunk (f05399a), the language cookie undone by /es prefetches (398d804), a missing no-session allowlist
entry (06a698f), an e2e test-order clash (e44c9aa), the board's integration counts (d4). S3, S4, S5, S7.2 and S9 are
committed and go live with the next green ship.

Ship 7 (run 43589096954, bbdd997) is live since midday: 62 pages in the sitemap (the cost guides and job hubs in
both languages), IndexNow accepted all 62, the board's old `?category=` addresses answer 308 to their hubs, and /pricing
loads 233 kB of gzipped JavaScript (445 before). Search Console still answers 403 for the service account (§8.1).

## 8. The owner's checklist

1. **Search Console access:**
   - Under Settings → Users and permissions, add
     `service-account-for-seo@gen-lang-client-0595306371.iam.gserviceaccount.com` as **Owner** of the verified Domain
     property `tasksnearme.com`.
   - Leave the AI features control at "Include".
2. **Request indexing** (URL Inspection → Request indexing), about 10 a day:
   - `https://tasksnearme.com/`, `/es`, `/austin`, `/austin/tasks`;
   - the five `/austin/<category>` pages;
   - `/become-a-helper`.
3. **Bing Webmaster Tools:** sign in, "Import from Google Search Console".
4. ~~**Decide on the sample data** (§6.1).~~ Done 2026-11-17: (a), hidden from the public and search engines.
5. **Profiles named exactly "TasksNearMe"**, each linking to tasksnearme.com: LinkedIn, Facebook, Instagram, X, a
   Nextdoor business page, Crunchbase, a Product Hunt launch. Send the URLs, and they go into the Organization's
   `sameAs`.
6. **Austin links and mentions** (never paid links):
   - neighborhood associations and newsletters;
   - UT Austin housing and move-in pages;
   - local press;
   - r/Austin (people search "taskrabbit austin reddit");
   - furniture stores and property managers (the IKEA model: book assembly at checkout).
7. **Google Business Profile:** the marketplace itself is likely ineligible (lead generation); helpers who run real
   businesses can have their own.
8. **At launch:** the posting-flow notice and the privacy-policy line for Google Jobs (S6), and who pays for background
   checks (F9).

## 9. Launch switch (`on`)

1. The sample data is gone from public pages, or the demo marketplace is cleared. Done 2026-11-17 (§6.1): the public
   and search engines see real rows only; signed-in testers keep the demo marketplace.
2. `LIVE_SITE_INDEXING = 'on'`: task pages and helper profiles that pass S2 become indexable, and the sitemap lists
   them.
3. Google Jobs (S6) switches on with its conditions; the server gets the service account to send Indexing API
   notifications.
4. Split the sitemap by page type (site pages, tasks, helpers) for per-type reports in Search Console.
5. Ship, then run `node scripts/seo/indexnow.mjs` and submit the sitemaps.

## 10. How we'll know it's working

| Signal | Source | Target |
|---|---|---|
| Indexed pages vs. sitemap | Search Console, Pages report | All site pages indexed within ~2 weeks |
| Brand searches | Search Console, branded-queries filter | "tasksnearme" at position 1 |
| "tasks near me" | Search Console, query report | Impressions first, then position ≤ 20 |
| Austin long tail | Search Console | Impressions for category, cost and Spanish queries |
| Bing | Bing Webmaster Tools | Pages indexed; AI Performance citations |
