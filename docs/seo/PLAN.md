# SEO plan: getting TasksNearMe found on Google

Written 2026-11-14 by tasksnearme-b7 for the owner, from four research briefs (the search results for our target
queries; how TaskRabbit, Thumbtack, Angi, HomeAdvisor, Handy and Airtasker win; how Craigslist, Airtasker, Upwork,
Nextdoor and Indeed handle listings and Google Jobs; Google's current rules) and an audit of the live site. It is also
the working plan for the sessions that build it. §5 is the backlog, §7 the schedule, §8 the owner's checklist. §11 is the
restart of 2026-11-20 (tasksnearme-7e): what each line of Search Console's indexing report was, what changed, and why
the bare brand search "tasksnearme" doesn't show the site yet.

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

**2026-11-18, after the Gainesville flip (Ship 44202542176, then d0ff36f):**
- Search Console has 30 of the 74 sitemap pages indexed: every site-wide page in both languages (home, how it works,
  pricing, become a helper, trust and safety, the help center). 38 are "discovered, not indexed" and 6 are still
  unknown: Gainesville's 34 pages, /cities, /cities/florida and the newest guides, none crawled yet.
- Nothing technical holds them back. All 74 answer 200 in about 10 ms, with self-canonicals, hreflang (en, es,
  x-default) and JSON-LD. The sitemap carries real lastmod dates and its hreflang links.
- Austin's 34 indexed pages now answer 404 and drop out as Google recrawls them. Since d0ff36f that includes the board
  and the job hubs, which streamed a soft 404 before.
- What limits indexing is Google's crawl rate for a four-day-old domain: about 1 to 15 pages a day so far.
- What raises it:
  - Google recrawling the home page, which links to every Gainesville page;
  - "Request indexing" (§8);
  - links from other sites (§8);
  - pages with substance once crawled (S1.7).
- Austin's job hubs were the pages Google never crawled at all, while it indexed the category and cost pages.

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
| S1.6 | Footer links to the first city's category pages and the board (every indexable page within 3 clicks) | UI (83) | Live (f13f131) |
| S1.7 | City guide on the city page (`content/cities/<market>.md`, Spanish in `content/cities/es/`): the area, the city's year, prices and safety, ~330 more words on a page that was mostly empty states | 37 | Built 2026-11-18 (Gainesville) |

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

1. ~~**Search Console access.**~~ Done 2026-11-17 (the service account is an Owner of the Domain property).
2. **Request indexing** (URL Inspection → Request indexing), about 10 a day, once per page (asking again doesn't help).
   After the ship that carries §11:
   - `https://tasksnearme.com/about` and `/es/about` (new), `https://tasksnearme.com/` (so Google rereads the
     organization's markup);
   - the cost guides not indexed yet: `/gainesville/yard-cleanup/cost`, then the Spanish ones;
   - `/help/contact`, `/es/help/what-you-can-get-help-with`.
   Don't request the job hubs while they have no open task: they say noindex until their first one (§11.1).
   **"Validate fix"** in the indexing report: press it only on the "Not found (404)" line, a week after that ship
   (the demo pages turn from noindex into 404s). The other lines are intended or are Google's own pace: validating
   "Excluded by noindex", "Page with redirect" or "Blocked by robots.txt" will "fail", harmlessly, because those pages
   are meant to stay out; "Discovered/Crawled – currently not indexed" can't be validated into the index.
3. **Bing Webmaster Tools:** sign in at bing.com/webmasters, "Import from Google Search Console" (5 minutes). Bing
   feeds DuckDuckGo, Copilot and ChatGPT search, and it reads our IndexNow notices only once the site is verified there.
4. ~~**Decide on the sample data** (§6.1).~~ Done 2026-11-17: (a), hidden from the public and search engines.
5. **Profiles named exactly "TasksNearMe"**, each linking to tasksnearme.com, with the same logo: LinkedIn (company
   page), Facebook, Instagram, X, YouTube, TikTok, a Nextdoor business page, Crunchbase, a Product Hunt launch (about
   2 hours). Send the URLs: they go into `BRAND_PROFILES` (src/modules/seo/structured-data.ts), the organization's
   `sameAs`. This is the biggest single step for the bare brand search (§11.3). Print "tasksnearme.com" on every flyer,
   sign and email: a search for the domain is never mistaken for the generic phrase.
6. **Gainesville links and mentions** (never paid links), the first city since 2026-11-17:
   - neighborhood associations and newsletters (Duckpond, Pleasant Street, University Heights, Haile Plantation);
   - UF's off-campus housing and move-in pages, and student organizations;
   - local press: The Independent Florida Alligator, The Gainesville Sun, WUFT, Mainstreet Daily News;
   - r/GNV and r/ufl (people search "reddit gainesville handyman");
   - apartment complexes and property managers near campus (move-in and move-out help), furniture sellers.
7. **Google Business Profile:** the marketplace itself is likely ineligible (lead generation); helpers who run real
   businesses can have their own.
8. **At launch:** the posting-flow notice and the privacy-policy line for Google Jobs (S6), and who pays for background
   checks (F9).

## 9. Launch switch (`on`)

1. The sample data is gone from public pages, or the demo marketplace is cleared. Done 2026-11-17 (§6.1): the public
   and search engines see real rows only; signed-in testers keep the demo marketplace.
2. Open the listings: an admin turns the config page's **Search engines** to "Open tasks and profiles to search", with
   a reason (since 2026-11-21, no deploy: §11.6). Task pages and helper profiles that pass S2 become indexable, and the
   sitemap lists them.
3. Google Jobs (S6) switches on with its conditions; the server gets the service account to send Indexing API
   notifications.
4. Split the sitemap by page type (site pages, tasks, helpers) for per-type reports in Search Console.
5. IndexNow announces the new pages at its next run; submit the sitemaps in Search Console.

## 10. How we'll know it's working

| Signal | Source | Target |
|---|---|---|
| Indexed pages vs. sitemap | Search Console, Pages report | All site pages indexed within ~2 weeks |
| Brand searches | Search Console, branded-queries filter | "tasksnearme" at position 1 |
| "tasks near me" | Search Console, query report | Impressions first, then position ≤ 20 |
| Austin long tail | Search Console | Impressions for category, cost and Spanish queries |
| Bing | Bing Webmaster Tools | Pages indexed; AI Performance citations |

## 11. Restart, 2026-11-20 (tasksnearme-7e)

**Live since 2026-11-21:** Ship 44894587105 put e19dbdc, b071df3 and 72b0b16 on tasksnearme.com (bbb2978). Checked live:
/dallas and the sample task pages answer 404; /about, /es/about and the move-out guide answer 200; /en/… is a 308; a Spanish
browser gets a 307 to /es/…; the sitemap lists 68 pages; IndexNow accepted them. Waiting on the owner: the brand's
profiles (§8.5) and Bing Webmaster Tools (§8.3), "later" (2026-11-21); Request indexing and Validate fix (§8.2).

The owner's view that day: Search Console's "Why pages aren't indexed" read Not found (404) 2, Alternate page with
proper canonical tag 1, Discovered – currently not indexed 31, Excluded by 'noindex' tag 830 (rising), Page with
redirect 3, Blocked by robots.txt 1, Crawled – currently not indexed 11. And the bare brand search "tasksnearme" didn't
show the site on page 1, while "tasksnearme austin" and "tasksnearme gainesville" did. Sources: URL Inspection of each
kind of address, a crawl of the live site (`node scripts/seo/crawl.mjs`), and three research briefs (Google's
documentation and staff statements through 2026-11; Search Off the Record 112, "How to read the Indexing Report").

### 11.1 What each line was, and what changed
| Line | What it was | Done |
|---|---|---|
| Excluded by 'noindex' tag: 830 | Pages Google crawled on 11-14 while the demo marketplace was public: the 14 demo cities (city, board, categories, cost guides, job hubs, in both languages), sample task pages and sample helper profiles; also /sign-in, /waitlist and /app (noindex on purpose). The demo pages still answered 200 with noindex, and the demo cities' pages linked to each other, so Google kept finding more. No live page links to any of them any more. | Demo cities, sample tasks and sample helpers answer a real 404 to anyone without a session (src/proxy.ts, src/modules/seo/sample-pages.ts); testers still see them. Google stops recrawling a 404, not a noindex page. The count moves to "Not found (404)" over the next weeks: harmless, and it shrinks as Google gives up on them. |
| Not found (404): 2 | Austin's pages. Austin is a later city (owner, 11-17: out of search until it opens). 26 of its 34 pages are still indexed and leave as Google recrawls them. | Kept. The not-found page offers "see where we are" and the waitlist to anyone who clicks an old result. |
| Page with redirect: 3 | http → https and www → tasksnearme.com (expected), and /en/become-a-helper: every page's language switch links to its /en/ copy, which answered a temporary 307, and Google kept /en/become-a-helper as its own canonical. | /en/… answers a permanent 308 (Cache-Control: no-store, so a browser never skips the language choice it carries). |
| Blocked by robots.txt: 1 | dev.tasksnearme.com (every non-live server's robots.txt shuts crawlers out). | Expected. |
| Alternate page with proper canonical tag: 1 | A sign-up address with ?next= (canonical: /sign-up). | Expected. |
| Discovered – currently not indexed: 31 | Mostly Gainesville's job hubs and the newest pages in Spanish. The hubs were empty ("No open tasks right now"). | Empty boards and job hubs: noindex, follow and out of the sitemap until their first open task (`taskListIndexable`, src/modules/seo/indexable.ts); then they join with the task's date. |
| Crawled – currently not indexed: 11 | The API doesn't list them; most likely the same empty or thin pages. | As above, and the content work in §11.4. |

### 11.2 One address per page and language
- /en/… → 308, as above.
- A plain address shows English, or the language the device chose (the NEXT_LOCALE cookie). Before, a browser whose
  Accept-Language preferred Spanish got the Spanish page at the plain address, with its canonical pointing at /es/…: if
  Googlebot crawled that way (Google's documented locale-adaptive crawling), the English page would have declared itself
  a copy of the Spanish one. Now a first visit from such a browser gets a temporary redirect to /es/…, which then
  becomes the device's choice. Search engines (no cookies) read English at every plain address.

### 11.3 The bare brand search "tasksnearme"
- Google treats the one word as the generic local search "tasks near me" (its spelling and compound-splitting
  systems), where a week-old domain with no links doesn't rank. With a city added, the search is rare enough that the
  site is the best match, which is why "tasksnearme gainesville" works. Search Console hides searches made by few
  people, so its "no impressions" for "tasksnearme" doesn't mean nobody searched.
- Markup doesn't make a site rank (Mueller, 2025). What makes Google treat a word as a brand: references to it across
  the web (the brand's own profiles, local press, directories), people searching for it and choosing the site, and
  time. For a name made of a generic phrase, expect months (Mueller on generic names, 2024–25).
- Done on the site, so that what Google reads is unambiguous:
  - `/about` and `/es/about`: what TasksNearMe is, its principles, where it's open, trust, helpers, languages and
    support; AboutPage and organization JSON-LD; in the sitemap and every page's footer.
  - The organization node is an `OnlineBusiness` (the most specific type that fits) with a support contactPoint, and
    gets `sameAs` from `BRAND_PROFILES` once the owner sends the profiles (§8.5).
  - "Tasks Near Me" left both alternateName lists: it named the brand after the generic search. The WebSite node keeps
    only "tasksnearme.com", Google's fallback.
  - Every page's footer reads "tasksnearme.com", so the exact word is on every page as text (the wordmark already
    reads "tasksnearme").
- Not published, because nothing is on record: a legal name, founding date, founders, address, phone or email. Each
  would strengthen the about page and the organization's markup (legalName, foundingDate, email): send them and they
  go in.
- Off the site (§8): the profiles (§8.5), Gainesville press and partners (§8.6), Bing Webmaster Tools (§8.3), the
  domain printed on everything. Avoid paid links, link networks, low-quality directories and click schemes.

### 11.4 Next
1. **Gainesville guides, starting before December's move-outs** (around UF's fall finals). Done:
   [Moving out in Gainesville](/help/moving-out-in-gainesville) (help center, Guides; both languages): the lease
   turnovers, the City's bulk pickup and yard waste rules and the county's, utilities, cleaning for the deposit, with
   links into the service pages and price guides. Every rule in it was read on gainesvillefl.gov and alachuacounty.us
   on 2026-11-20. Next: hurricane-season prep (yard and outdoor items), moving into a Gainesville rental in August,
   and leaf season (late winter and spring for the oaks), each from the official pages, dated.
2. **First-party data** on the category pages and cost guides once there are real bookings: prices paid (with the
   sample size and dates), tasks done, reviews. Data nobody else has is what the city × service pages need most.
3. **At launch**, an admin opens the listings from the config page (§9, §11.6): open task pages and helper profiles
   that pass S2 join search; split the sitemap by type then.
4. If request-time metadata ever reaches an indexable page, add the AI crawlers (GPTBot, OAI-SearchBot,
   PerplexityBot, ClaudeBot) to Next's `htmlLimitedBots`. Today every indexable page has its title, canonical and
   description in `<head>`.
5. An option for the owner, not taken: Austin's cost guides back in search before Austin opens (they had impressions,
   e.g. "/es/austin/moving-help/cost" at position 7), as a 200 page that says Austin opens later.

### 11.5 Measuring it
- The daily report (`scripts/seo/report.mjs`, cron 12:30 UTC, docs/seo/reports/latest.md) now also shows brand
  searches over 90 days, the addresses leaving search (Austin, demo cities, /en/) with Google's status for each, pages
  that had impressions but no longer answer 200, and it resubmits the sitemap when it changed after Google last read
  it.
- `node scripts/seo/crawl.mjs [origin]` crawls the site the way a search engine does and lists links to redirects,
  404s and noindex pages, indexable pages missing from the sitemap, sitemap pages that aren't indexable, duplicate
  titles and descriptions, and thin pages.

### 11.6 Search listings are an admin setting (2026-11-21)
Opening task pages and helper profiles to search used to be a code change (`LIVE_SITE_INDEXING = 'on'`) and a ship,
and ships can stall (GitHub billing paused them on 11-21). Now it's the config page's **Search engines** section, for
admins, with a reason (sweep J-L6, ab's request; turning it on stays the owner's call on the day):
- `site` (the default, `LIVE_SITE_INDEXING`): the site's own pages; task pages and helper profiles answer `noindex` and
  stay out of the sitemap. `on`: they join, the ones that pass S2.
- Stored as the global feature flag `search.listings` (absent until the first change); each change is an audit row
  (`config.search_indexing`, its reason, from and to). The plain flag list doesn't show it and can't change it.
- Read where it decides: robots.txt and the sitemap on each request (src/modules/seo/indexing-setting.ts), the proxy's
  X-Robots-Tag every 15 seconds through its own connection (src/modules/seo/proxy-search-indexing.ts), IndexNow at each
  run. Changing it refreshes the sitemap's cache. No restart.
- Only the live site follows it. Every other copy of the app stays out of search whatever its database says; the e2e
  build follows it once a test sets it (seo.spec opens and closes it, then removes it). SEARCH_INDEXING still overrides
  everything where a server sets it.
- No "off" on the live site: robots.txt would then block crawling and Google could never see a noindex. For an
  emergency removal, use Search Console's Removals tool.
