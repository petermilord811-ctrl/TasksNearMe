# Craigslist listing, browsing, search and filtering patterns (US, current as of 2026-11-14)

Method note: besides Craigslist's help center and outside commentary, much of this was observed directly on 2026-11-14 without logging in:
- the HTTP 301 redirects from legacy search URLs;
- the server-rendered (no-JS) search pages;
- the search app's public JavaScript, loaded through `https://www.craigslist.org/static/www/manifest.js`. The main search chunk is `https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js`, cited below as "CL search JS"; the hash will change on future deploys.

Facts taken from code describe what the shipped client contains. I did not render the UI in a browser, so on-screen placement comes from the help pages and from user reports. "(older)" marks behavior from before 2023.

## 1. How is location organized: city sites, sub-areas, nearby areas, distance from a ZIP, and labels on multi-area results?

### Takeaway
Craigslist's geography has three nested tiers, plus two tools that cut across them:
- **Area:** a city "site" such as `austin` or `sfbay`.
- **Subarea (optional):** for example, sfbay splits into sfc, sby, eby, pen, nby and scz.
- **Neighborhoods (optional):** a multi-select filter inside a subarea.
- **Cross-cutting:** an explicit **nearby areas** list (areas within about 375 km) and a **radius search** ("miles from location" plus a ZIP, up to 1,000 miles).

After an undated migration, every location type uses one URL scheme on `www.craigslist.org`: `/search/area/austin`, `/search/subarea/eby`, and `/search/city/oakland-ca?postal=94612&radius=5`. Old city-subdomain URLs 301-redirect there.

### Cited Findings
**Tiers and URL scheme (observed 2026-11-14)**
- The help center says "craigslist sites are based on geographic location". A posting's site "cannot be changed", and "It is not possible to post to more than one site at a time." — [CL help: posting location](https://www.craigslist.org/about/help/posting/features/location)
- The SF Bay homepage lists six subareas (`sfc`, `sby`, `eby`, `pen`, `nby`, `scz`), each linking to `/subarea/<abbr>`. The site itself is `/area/sfbay`. — [SF bay homepage](https://www.craigslist.org/area/sfbay)
- The Austin homepage has **no subareas**. Instead it shows a "nearby cl" list of other sites that link to `/area/<slug>`, for example abilene, beaumont, brownsville, college station, corpus christi, dallas, houston, killeen-temple, san antonio, san marcos and shreveport. — [Austin homepage](https://www.craigslist.org/area/austin)
- Legacy URLs now 301-redirect to the unified scheme. These requests were made on 2026-11-14:
  - `austin.craigslist.org/search/bbb?srchType=T&hasPic=1&postedToday=1` → `www.craigslist.org/search/area/austin?cat=bbb&hasPic=1&postedToday=1&srchType=T` — [legacy URL](https://austin.craigslist.org/search/bbb?srchType=T&hasPic=1&postedToday=1)
  - `sfbay.craigslist.org/search/eby/sss?query=desk` → `www.craigslist.org/search/subarea/eby?cat=sss&query=desk` — [legacy URL](https://sfbay.craigslist.org/search/eby/sss?query=desk)
  - `sfbay.craigslist.org/search/sss?query=desk&search_distance=5&postal=94612` → `www.craigslist.org/search/city/oakland-ca?cat=sss&postal=94612&query=desk&radius=5`. A ZIP search becomes a "city" location named after a nearby city, and `search_distance` is renamed `radius`. — [legacy URL](https://sfbay.craigslist.org/search/sss?query=desk&search_distance=5&postal=94612)
  - `…&lat=37.8&lon=-122.27&search_distance=3` → `/search/city/oakland-ca?cat=sss&lat=37.8&lon=-122.27&query=desk&radius=3` — [legacy URL](https://sfbay.craigslist.org/search/sss?query=desk&lat=37.8&lon=-122.27&search_distance=3)
  - In the redirect targets, query parameters are sorted alphabetically: `bundleDuplicates, cat, condition, max_price, min_price, nearbyArea, purveyor, query, sort`. — [legacy URL](https://austin.craigslist.org/search/sss?query=desk&bundleDuplicates=1&searchNearby=2&nearbyArea=270&min_price=10&max_price=100&sort=priceasc&condition=20&purveyor=owner)
- The search page starts with a typed location object: `'location': {"v":1,"type":"area","areaId":15}`, where 15 is Austin. The forums links on the Austin homepage also use `areaID=15`. — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb); [Austin homepage](https://www.craigslist.org/area/austin)
- Posting URLs also live on www and use opaque IDs: `www.craigslist.org/view/d/<locality>-<title-words>/<22-char id>`. The slug starts with the poster's locality. Examples from the Austin services feed: `/view/d/georgetown-williamson-county-cleaning/…`, `/view/d/cedar-park-fence-install-staining-and/…`, `/view/d/san-marcos-interior-painting-and/…`, `/view/d/pflugerville-plumber-shows-up-on-time/…`. — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb)

**Choosing a location (searcher)**
- Help page: "click the geographical name at the top of the page. A map will open up - you can write in the name of a city or ZIP code or adjust the map. As you type you are presented with suggestions… For some sites, you can choose a subarea to further narrow your results." — [CL help: location searching](https://www.craigslist.org/about/help/searching/how-to-search/location)
- In the shipped code, the location picker has two tabs, "map" and "nearby areas and subareas". The control is labeled "adjust search area", and changing the area removes any `nh` (neighborhood) parameter from the search. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- "Nearby areas" are computed in the client as every area whose center lies within `MAX_NEARBY_AREA_DISTANCE: 375e3` of the current area, using Leaflet's `distanceTo`. The list is then sorted with a locale collator, so alphabetically. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- The legacy form `searchNearby=2&nearbyArea=270` redirects to `nearbyArea=270`: the flag is dropped and the explicit area is kept. A bare `searchNearby=1`, the older "include nearby areas" flag, is dropped entirely. — [legacy URL](https://austin.craigslist.org/search/sss?query=desk&bundleDuplicates=1&searchNearby=2&nearbyArea=270&min_price=10&max_price=100&sort=priceasc&condition=20&purveyor=owner); [legacy URL](https://austin.craigslist.org/search/sss?query=desk&sort=date&srchType=T&searchNearby=1)
- Radius control in the code:
  - The label is "miles from location", or "km from location" where metric units apply.
  - There is a numeric distance box (`type="tel"`, placeholder "miles" or "kilometers") and a postal box (`name="postal"`, placeholder "from zip" in the US, "postal code" elsewhere).
  - A geo search shows a close (×) button that returns to the plain area search.
  — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- From the changelog: "1000-mile radius searches: Choose a search location that covers half the USA. Great for searches for rare items. As always, exercise care when doing business with others out of your area." — [CL what's new](https://www.craigslist.org/about/whats-new)
- Neighborhoods: in a subarea search, if the subarea has neighborhoods, the client adds the filter `{label:"neighborhoods", name:"nh", type:"multi"}`. Its options are the subarea's neighborhood names and IDs. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- Signed-in users can set a "default craigslist home page". — [CL help: account settings](https://www.craigslist.org/about/help/account/features/settings)

**Location of a posting (poster)**
- "Postings require a ZIP code, which places your posting on a map. The map highlights an area around the ZIP code in a light purple circle." A pin is optional: click the map, or enter an address or cross streets and click "find". Pins can be dragged, and entering only a ZIP code switches back to the area circle. — [CL help: map](https://www.craigslist.org/about/help/posting/features/map)
- Rows also show a free-text location line typed by the poster. It is often a service area or a slogan rather than a place: "South Austin, Buda, Kyle, San Marcos", "All areas", "Austin, Buda, Kyle. Dripp Spgs, Wimberely, Drftwd", or "💪WE ALSO LOAD&UNLOAD RENTALS,PODS,ABF TRAILERS". — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb)

**Older behavior**
- (older) Before the migration, sites lived on city subdomains, with the subarea as a path segment (`sfbay.craigslist.org/search/eby/sss`). Searches used a `searchNearby` include-nearby flag and a `search_distance` parameter in miles. These forms are still accepted and redirected, as shown above. — [legacy URL](https://sfbay.craigslist.org/search/eby/sss?query=desk)

### Inferences
- How this maps to TasksNearMe:
  - market ≈ CL area;
  - neighborhoods ≈ CL's `nh` multi-select;
  - ZIP plus radius works as a separate filter that can cross market borders;
  - "nearby markets" are chosen explicitly from a list built with a distance cutoff, instead of a vague "include nearby" checkbox. That is the direction Craigslist itself moved: it dropped `searchNearby` and kept `nearbyArea`.
- Craigslist treats the whole Austin metro (Georgetown, Cedar Park, Pflugerville, Buda, Kyle, San Marcos) as one pool. Posts are told apart only by free text in the row and the slug. A structured neighborhood field would clearly beat Craigslist's Austin site.
- San Marcos is a separate CL site, yet San Marcos posts also appear in the Austin feed. Sites overlap at their edges, and radius search is what covers the edges.
- Two patterns worth copying:
  - Approximate location by default (the ZIP circle), with an exact pin only if the poster chooses one. For tasks, show the neighborhood or a fuzzed circle while browsing, and reveal the address only after booking.
  - Typed location objects and alphabetically ordered (canonical) URLs. These make every search shareable, bookmarkable and easy to de-duplicate as a saved search.
- The 375e3 constant is most likely meters (about 375 km or 233 mi), because Leaflet's `distanceTo` returns meters.

### Gaps
- I could not verify how rows from nearby areas are labeled in the current UI. The older UI added a tag such as "(oakland)" after the title; I also don't know whether such rows are grouped under a "nearby results" heading. I could not render the JS UI, and the Wayback Machine returned HTTP 429 for archived 2021 search pages, so the older labeling is not confirmed from a primary source here.
- I found no official date for the move to the www.craigslist.org/search/area/… scheme.
- The 375e3 unit (meters) is inferred, not documented.

## 2. What views exist, what each row or card shows, how results are grouped, and how they are sorted

### Takeaway
The client ships six result layouts (list, thumb, card, grid, gallery, map) plus a desktop "preview" split pane. The map uses Leaflet with marker clustering. Rows are minimal: title, price, posting date, a location line, and a thumbnail where the layout has one.

Default order is by posting date, and renewing or reposting moves an ad back to the top, which is why renew and repost limits matter. There are seven sort modes, each with its own URL value:
- newest = `date`
- oldest = `dateoldest`
- distance = `dist`
- price low→high = `priceasc`
- price high→low = `pricedsc`
- relevance = `rel`
- upcoming = `upcoming`

### Cited Findings
- The help page lists five views: "List: posting titles only, no images; Thumb: small image to the left of the posting title; Grid: medium images above the posting title; Gallery: large image above the posting title; Map: postings are displayed on a map; click a pin for more information". On desktop the view is chosen from the "drop-down menu under the search bar on the left". On mobile web it is under the three-line icon, "change view". — [CL help: display options](https://www.craigslist.org/about/help/searching/display)
- The view table in the code has **six** modes: `list`, `thumb`, `card`, `grid`, `gallery`, `map` (CSS classes `cl-search-view-mode-*`). "card" does not appear on the help page. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- "preview mode: Choose 'preview' in the search results page to view the list of results and the full posting side-by-side in the same screen." — [CL what's new](https://www.craigslist.org/about/whats-new)
- The map uses Leaflet (its attribution SVG is in the bundle) and the marker-cluster plugin (`_topClusterLevel.getAllChildMarkers`, `_refreshClustersIcons`). — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- (older) A report from about 2012 says Craigslist first offered a list/map toggle for apartment listings, built with Leaflet and OpenStreetMap data and rolled out gradually. I saw only the search-result summary of this article, not the article itself. — [The Next Web](https://thenextweb.com/news/craigslist-rolls-out-new-map-view-feature-for-apartment-searches)
- Sort table in the code (label → URL value):
  - "newest" → `date`
  - "oldest" → `dateoldest`
  - "distance" → `dist`
  - "﹩→ $$$" (long label "price: low to high") → `priceasc`
  - "$$$ → ﹩" ("price: high to low") → `pricedsc`
  - "relevance" → `rel`
  - "upcoming" → `upcoming`
  — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- From the changelog: "You can now sort by oldest (not just newest). Also, it was difficult to understand the difference between sort-by price↑ vs price↓, so those options now display as $$$→$ and $→$$$". — [CL what's new](https://www.craigslist.org/about/whats-new)
- "Upcoming" ordering uses each item's next relevant date: an event's first or last date, a housing ad's open-house dates, or a general list of dates. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- In one "sort by" select, the two price options are added only on a condition (`[newest, oldest, s&&priceAsc, s&&priceDesc]`). Price sorts are therefore context-dependent, not always offered. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- Each result in the client carries `postedDate`, `location`, `categoryId`, `images`/`imageIds`, `dedupeKey`, `distance` and `relevance`. Row parts, by class name: `result-posted-date`, `priceinfo`, `result-location` and `meta`, plus `housing-meta`, `salary-meta`, `company-meta` and `job-title-meta` for specific categories. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- The server-rendered (no-JS) fallback is a plain ordered list. Each item has a title, a price, an optional location line and a link.
  - Austin services rendered 262 items in one document.
  - Every services row showed "$0", even when the title advertised a rate ("$150 FOR 2 PRO MOVERS", "$99/HR").
  - Other feeds: gigs had 290 items, labor/move 135, and "desk" for sale 349.
  — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb)
- Default ordering is by posting date, newest first, with renewal and approval moving ads back up:
  - "All postings move down the listings as new postings are published." A paid ad cannot be moved back up: "A new posting or repost must be created and purchased to be listed at the top of 'by date' search results." — [CL help: lifespan](https://www.craigslist.org/about/help/faqs/lifespan)
  - Free postings can be renewed to the top "every 48-72 hours". — [CL help: renew](https://www.craigslist.org/about/help/posting/modify/renew)
  - Postings held for review are "top-posted upon approval". — [CL help: hold](https://www.craigslist.org/about/help/faqs/hold)
  - Undeleted postings "reappear on the site under their original posting date". — [CL help: delete](https://www.craigslist.org/about/help/posting/modify/delete)
- Duplicates have a toggle labeled "hide duplicates" / "show duplicates" (`showDuplicates`), and every result carries a `dedupeKey`. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js). The legacy `bundleDuplicates=1` parameter survives the redirect. — [legacy URL](https://austin.craigslist.org/search/sss?query=desk&bundleDuplicates=1&searchNearby=2&nearbyArea=270&min_price=10&max_price=100&sort=priceasc&condition=20&purveyor=owner)
- "'more results in' links: The search page now includes links to other categories that contain results for your search… often-overlooked categories such as collectibles, free stuff, and garage sales". — [CL what's new](https://www.craigslist.org/about/whats-new). The client adds this as a filter block named `othercats` with the label "more results in". — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- User reports on defaults and persistence (February–March 2023):
  - A user said results "keep defaulting to gallery view, regardless of anything I try", and that Craigslist "recently introduced variability in layout, within region".
  - SearchTempest staff suggested that "the cookie that craigslist sets to remember your sort preference" might not persist, calling it possibly "a bug on craigslist's end".
  — [SearchTempest community thread](https://searchtempest.zendesk.com/hc/en-us/community/posts/14284430829075-CL-page-layout-defaults-to-gallery-each-time)
- (older, August 2013) A test of a list layout with the price first drew complaints ("What a terrible formatting change"). Grid view was praised as "much quicker", one user said it makes ads without pictures easy to ignore, and another noted "there's three views to choose from". The original poster noticed that other states still showed the old layout, which suggests a test market. — [Garage Journal forum](https://www.garagejournal.com/forum/threads/does-everyone-else-hate-the-new-craigslist-format-as-much-as-me.210883/)

### Inferences
- Gallery appears to be the default in the newer UI, based on the 2023 reports; I could not confirm the 2026 default per category. That default suits photo-led for-sale browsing better than text-led services.
- For tasks, which rarely have meaningful photos, a dense list (or thumb) default fits better, with the viewer's choice saved. Saving it server-side for signed-in users avoids the cookie-loss complaint.
- Offer only the sorts that apply: distance only when there is a geographic origin, relevance only with a text query, price only when a price exists, and "upcoming" (soonest task date) for dated tasks. Keep the labels plain; Craigslist had to relabel its price arrows.
- Bundle duplicate posts by a content key behind a "show duplicates" control. Craigslist's services feeds are full of near-identical mover and cleaner ads.
- Ordering by date, combined with limits on renewing and reposting, is a fairness mechanism: every post gets the top slot when it is new, and bumps are rate-limited. Paid placement on Craigslist is still only "a new post", not a boost.

### Gaps
- Not verified because I did not render the UI: page size, pagination versus infinite scroll, and whether dates appear as group headers.
- Not verified: the default sort when a text query is present (newest or relevance).
- Not verified: what a map pin's popup shows.

## 3. Which filters exist in services, gigs and for-sale search, and what do the category and subcategory taxonomies look like?

### Takeaway
Every search gets the same generic filters:
- keyword search with boolean operators;
- "has image" and "posted today";
- miles or km from a ZIP or location;
- neighborhoods, where defined;
- category exclusion (`excats`) and "more results in" links;
- an owner/dealer segmented control where it applies;
- hide/show duplicates;
- a price block (min/max fields, a price histogram, a "free" checkbox) where price applies.

Category-specific attributes, such as `condition` for for-sale or `is_paid` for gigs, are defined by the server, and the server also suggests their order. Services has 21 subcategories, gigs 8, for sale 45 and jobs 31.

### Cited Findings
**Generic filters**
- Help page: "Some categories have attributes for refining your search… For Desktop: The attributes options are displayed on the left hand side of the page… After selecting attributes make sure to click 'update search'. For Mobile: Click the icon with three horizontal lines… choose 'filter'… click 'apply'." — [CL help: filtering](https://www.craigslist.org/about/help/searching/filtering)
- "Attributes are specific information that can be required or optional for each category. Attributes help users search for postings by using the attributes filters". — [CL help: attributes](https://www.craigslist.org/about/help/posting/features/attributes)
- The client ranks filter blocks in this order:
  1. `excats` (excluded subcategories)
  2. `othercats` ("more results in")
  3. `purveyor` (owner/dealer)
  4. "basic bools"
  5. `geoLocation` (radius)
  6. `nh` (neighborhoods)

  All other blocks use a `serverSuggestedOrder` sent by the server. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- "basic bools" holds the "has image" (`hasPic=1`) and "posted today" (`postedToday=1`) checkboxes. The client builds this group itself for the favorites and hidden lists. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- The `purveyor` (owner/dealer) filter is drawn as a segmented control (`variant="segment…"`). — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)
- The price block has a "price" label, a "free" checkbox and a bar-chart widget. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js). From the changelog: "Use the new bar chart to see the range of prices and average price for items in your search. Click and drag to select a range or type in the min/max fields." — [CL what's new](https://www.craigslist.org/about/whats-new)
- "The 'free' category now shows free items from all for-sale categories. Within any other category, easily find free items by checking the 'free' checkbox under PRICE." — [CL what's new](https://www.craigslist.org/about/whats-new)
- "filter buttons: Buttons across the top of the search page (like these, for apartments) make it easier to filter your results and to see what filters you have selected." — [CL what's new](https://www.craigslist.org/about/whats-new)
- The client groups these parameter names together: `sale_date`, `purveyor`, `srchType`, `hasPic`, `postedToday`, `bundleDuplicates`, `showDuplicates`. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)

**Text search**
- Boolean operators:
  - `"coffee table"`: exact phrase
  - `table -coffee`: exclude a word
  - `honda | toyota`: either word
  - `(toyota | honda) -2000 -2001`: grouping
  - `din* table`, `iphone*`: wildcards
  — [CL help: boolean](https://www.craigslist.org/about/help/searching/how-to-search/boolean)
- Matching: "craigslist only uses exact matching in searches". Search covers a posting's title, attributes and description. — [CL help: finding your posting](https://www.craigslist.org/about/help/faqs/my-posting)
- While you type, search suggests "results in a variety of categories. Click the one that best describes what you are looking for." — [CL help: text search](https://www.craigslist.org/about/help/searching/how-to-search/homepage). The changelog adds homepage autosuggestions and an info button with search tips that appears when hovering over the search field. — [CL what's new](https://www.craigslist.org/about/whats-new)

**URL parameters accepted today** (all kept through the 301 redirects on 2026-11-14 unless noted; sources are the legacy-URL requests in §1 and §2 and the CL search JS)

| Parameter | Meaning | Evidence |
|---|---|---|
| path `/search/area/<site>`, `/search/subarea/<abbr>`, `/search/city/<city-st>` | location type | redirects |
| `cat=<abbr>` | category (e.g. `bbb` services, `lbs` labor/move, `ggg` gigs, `lbg` labor gigs, `sss` for sale, `zip` free) | redirects; homepage links |
| `query` | keywords with boolean operators | redirects |
| `srchType=T` | titles only (older UI label "search titles only"; I found no label for it in the current English UI code) | [legacy URL](https://austin.craigslist.org/search/bbb?srchType=T&hasPic=1&postedToday=1) |
| `hasPic=1`, `postedToday=1` | has image; posted today | redirect + JS |
| `bundleDuplicates=1` / `showDuplicates` | collapse or show duplicates | redirect + JS |
| `min_price`, `max_price` | price range | [legacy URL](https://austin.craigslist.org/search/sss?query=desk&bundleDuplicates=1&searchNearby=2&nearbyArea=270&min_price=10&max_price=100&sort=priceasc&condition=20&purveyor=owner) |
| `condition=<code>` | item condition (for sale) | same |
| `purveyor=owner\|dealer` | by owner or by dealer | same + JS |
| `excats=<ids>` | exclude subcategories | [legacy URL](https://austin.craigslist.org/search/sss?query=desk&excats=7-13-22) |
| `nearbyArea=<areaId>` | include a specific nearby site (`searchNearby` is dropped) | redirect |
| `postal`, `radius` (formerly `search_distance`), `lat`, `lon` | radius search | redirect + JS |
| `nh=<id>` | neighborhoods (multi-select) | JS |
| `sort=date\|dateoldest\|dist\|priceasc\|pricedsc\|rel\|upcoming` | sort (`sort=upcoming` was dropped from an events URL, probably because it is the default there) | JS + redirects |
| `sale_date=YYYY-MM-DD` | events or sales on a given day | [Austin homepage](https://www.craigslist.org/area/austin) |
| `is_paid=yes` | gigs: paid only (kept); `employment_type` was dropped from the gigs URL | [legacy URL](https://austin.craigslist.org/search/ggg?is_paid=yes&employment_type=3) |

**Taxonomies (Austin homepage, 2026-11-14; category code in brackets)** — [Austin homepage](https://www.craigslist.org/area/austin)
- **services [bbb], 21 subcategories:** automotive [aos], beauty [bts], cell/mobile [cms], computer [cps], creative [crs], cycle [cys], event [evs], farm+garden [fgs], financial [fns], health/well [hws], household [hss], labor/move [lbs], legal [lgs], lessons [lss], marine [mas], pet [pas], real estate [rts], skilled trade [sks], sm biz ads [biz], travel/vac [trv], write/ed/tran [wet].
- **gigs [ggg], 8 subcategories:** computer [cpg], creative [crg], crew [cwg], domestic [dmg], event [evg], labor [lbg], talent [tlg], writing [wrg].
- **for sale [sss], 45 subcategories:**
  - antiques [ata], appliances [ppa], arts+crafts [ara], atv/utv/sno [sna], auto parts [pta], aviation [ava], baby+kid [baa], barter [bar], beauty+hlth [haa]
  - bike parts [bip], bikes [bia], boat parts [bpa], boats [boo], books [bka], business [bfa], cars+trucks [cta], cds/dvd/vhs [ema], cell phones [moa]
  - clothes+acc [cla], collectibles [cba], computer parts [syp], computers [sya], electronics [ela], farm+garden [gra], free [zip], furniture [fua], garage sale [gms]
  - general [foa], heavy equip [hva], household [hsa], jewelry [jwa], materials [maa], motorcycle parts [mpa], motorcycles [mca], music instr [msa], photo+video [pha]
  - rvs+camp [rva], sporting [sga], tickets [tia], tools [tla], toys+games [taa], trailers [tra], video gaming [vga], wanted [waa], wheels+tires [wta]
- **jobs [jjj], 31 subcategories:** these include general labor [lab], skilled trade/craft [trd], customer service [csr] and transport [trp]. Also on the page: **housing** [hhh] with 10 subcategories, **community** [ccc] with 16, **resumes** [rrr], 51 discussion forums, and a calendar of event days (Nov 8 – Dec 5). Past days are not links; today and later days link to `?cat=eee&sale_date=YYYY-MM-DD`.
- Posting types: "community, services, housing, for sale, jobs, gigs, and resumes". "Categories are subsections under the type of a posting". When editing, "the type of a posting cannot be changed. Only some categories can be changed within a type." — [CL help: type](https://www.craigslist.org/about/help/posting/features/type); [CL help: category](https://www.craigslist.org/about/help/posting/features/category); [CL help: edit](https://www.craigslist.org/about/help/posting/modify/edit)
- US posting fees:
  - Services: $5
  - Gigs: $3–10
  - Jobs: $10–75
  - For sale by owner: $0–5 (cars+trucks, motorcycles, RVs+campers: $5)
  - For sale by dealer: $5
  - Apartments (Boston, Chicago, NYC only): $5
  - Office and commercial: $5

  "Fees vary depending on geographic location." — [CL help: fees](https://www.craigslist.org/about/help/faqs/fees)

### Inferences
- How the categories map to TasksNearMe:
  - moving help → CL labor/move [lbs] and labor gigs [lbg];
  - light cleaning → household [hss] and domestic gigs [dmg];
  - yard cleanup → farm+garden [fgs];
  - computer help → computer services [cps] and computer gigs [cpg];
  - furniture assembly has no category of its own on Craigslist; it is scattered across labor/move, household and skilled trade.

  A task-first taxonomy with a few more specific buckets is an opportunity.
- Craigslist's two sides map onto TasksNearMe. "Services" are offers by providers, which corresponds to helper profiles. "Gigs" are short jobs posted by the person who needs them, which corresponds to task posts. Gigs carry an explicit paid/unpaid attribute, so TasksNearMe should require a structured budget instead of free-text prices; Craigslist's services rows all show "$0".
- Patterns to reuse:
  - a small set of generic filters (posted today, has photo, radius from ZIP, neighborhood multi-select, budget range with a histogram), plus category-specific attributes defined on the server with a suggested order;
  - all filter state in URL parameters, which saved searches and alerts need;
  - an "apply" step on mobile only;
  - removable filter "buttons" (chips) at the top to show which filters are active.

### Gaps
- I did not inspect the server-provided filter definitions, so these are unknown: the label and options of the gigs pay filter (only `is_paid=yes` is confirmed), any attributes specific to services subcategories, and the values of `condition`.
- I could not tell whether title-only search is still offered in the current UI. The parameter is still accepted, but I found no UI label for it. A 2023 forum post said it was gone; see §5.

## 4. Saved searches and alerts, favorites, hiding and flagging, posting rules, the email relay, expiration, and renew/repost limits

### Takeaway
- Browsing and posting need no account. Favorites work without one too and are stored in the browser; an account syncs them.
- Saved searches and email alerts need an account. Alerts have adaptive frequency, a 20-result cap and newest-first order.
- Moderation runs on community flags: enough flags remove a free ad automatically. Staff, automated systems and manual holds back this up.
- Contact goes through a randomized email relay for each posting, optional phone/text, and opt-in chat for signed-in users.
- Free ads live 7–45 days and can be renewed every 48–72 hours. Paid ads live 30 days and can only be reposted, at full price.

### Cited Findings
**Accounts**
- "craigslist does not require you to create an account in order to make a posting." The features that need an account are: posting drafts, posting history, account settings, saved searches, search alerts and the favorites list. — [CL help: account features](https://www.craigslist.org/about/help/account/features)
- Posting history can be searched "by category, posted date, and keyword". — [CL help: posting history](https://www.craigslist.org/about/help/account/features/posting-history)

**Saved searches and alerts**
- Saved searches: "clicking the 'save search' link near the top right of a search results page". After logging in you can "view, sort, rename and follow saved searches". "Saved searches cannot be edited; you must create a new one and delete the old one." — [CL help: saved searches](https://www.craigslist.org/about/help/account/features/searches)
- Search alerts are "emails that are automatically sent when a saved search has new results":
  - You turn one on by "clicking the box in the 'alert' column", and you get a welcome email.
  - "A maximum of 20 results will be displayed in the email."
  - "The frequency of searches are based on the number of results in the last alert. Fewer results will cause more frequent searches."
  - Alerts "include renewed, reposted, and edited posts if they now match".
  - They "display most recent results first -- even if the saved search specifies a different sort order".
  - Text after an "&" in a search is ignored by alerts.
  - To stop an alert, use the unsubscribe link in the email, uncheck the alert column, or delete the search.
  — [CL help: search alerts](https://www.craigslist.org/about/help/account/features/alerts)

**Favorites and hidden**
- "Clicking the star to the left of a posting's title will add the posting to your favorites", after which a "favorites" link appears in the upper right of the results page.
  - Without logging in, favorites are "temporary files associated with the browser used to create them". When logged in, they belong to the account and work on any device.
  - A deleted or expired posting disappears from the list.
  - Favorites can be shared by copying the favorites URL. Clicking the star again removes one.
  — [CL help: favorites](https://www.craigslist.org/about/help/account/features/favorites)
- "category selector on Favorites page: View your favorited or hidden postings by category." The post, account and favorites links "moved from text links on the left to icons across the top of the page." — [CL what's new](https://www.craigslist.org/about/whats-new). The Austin homepage header shows post, account, favorites and **hidden**. — [Austin homepage](https://www.craigslist.org/area/austin)
- The client keeps a "favorites" list (`fav`) and a separate "hidden" list (`ban`, "banished"). Each has its own breadcrumb, the has-image and posted-today filters, and a sort select. — [CL search JS](https://www.craigslist.org/static/www/02ea7bdecf422449e14714f12e1dfd4522ce9b4f.js)

**Flagging and moderation**
- From the flagging FAQ:
  - "craigslist users self-publish tens of millions of free postings each month… CL users flag prohibited postings they find via the flagging link at the top of each posting."
  - "Free classified ads sufficiently flagged are subject to automated removal. Postings may also be flagged for removal by CL staff or CL automated systems. Millions of ads are removed by flagging monthly…"
  - "no moderation system is perfect, and a small percentage of ads removed are compliant. Flagged postings that comply… may be reposted, reworded as necessary."
  — [CL help: flagging](https://www.craigslist.org/about/help/faqs/flagging)
- "For spam, scam or abusive postings… use the 'flag' button located above the posting title". — [CL help: flagging postings](https://www.craigslist.org/about/help/safety/scams/reporting/post-flagging)
- "Postings may be held temporarily for manual review by craigslist staff. New postings held for review will generally be top-posted upon approval." — [CL help: hold](https://www.craigslist.org/about/help/faqs/hold)
- The terms of use say: "You agree not to abuse CL's flagging or reporting processes." They also set liquidated damages per violation:

  | Violation | Damages |
  |---|---|
  | Harvesting user information | $1 |
  | Publishing or misusing someone's personal information | $1,000 |
  | Misrepresenting identity | $1,000 |
  | Posting prohibited content | $4 |
  | Unsolicited email to an address obtained from CL | $25 |
  | Unsolicited text or call to a CL user | $500 |
  | Abusing flagging | $1 |

  — [CL terms of use](https://www.craigslist.org/about/terms.of.use)
- The prohibited list includes:
  - "spam; miscategorized, overposted, cross-posted, or nonlocal content"
  - "postings or email the primary purpose of which is to drive traffic to a website"
  - "affiliate marketing; network, or multi-level marketing; pyramid schemes"
  - "false, misleading, deceptive, or fraudulent content; bait and switch; keyword spam"
  - "anyone's personal, identifying, confidential or proprietary information"
  - "pet sales (re-homing with small adoption fee ok)"
  — [CL prohibited list](https://www.craigslist.org/about/prohibited)

**Posting flow and verification**
- Steps: choose the site, then the type, then the category. Enter the text ("Required fields are highlighted in green"), confirm the map, add images, then review the "unpublished draft" and publish. An email confirmation from robot@craigslist.org and phone verification may be required. "Your posting should appear on craigslist about 15 minutes after confirmation." — [CL help: creating a posting](https://www.craigslist.org/about/help/posting/create)
- Phone verification:
  - The code comes by voice or text. "International and VOIP numbers are not supported", and a code can be requested only "once every 5 minutes".
  - "Phone numbers provided for verification are not displayed on postings." A phone number can belong to only one account at a time.
  - "craigslist only asks for a phone code while you are in the posting process. Any other request for your phone code is a scam."
  — [CL help: phone verification](https://www.craigslist.org/about/help/posting/verify/phone)
- Images are optional and "not available in all posting types". The first ("featured") image is the one shown in browse views, and images can be reordered by dragging. — [CL help: images](https://www.craigslist.org/about/help/posting/features/images). The changelog adds uploading images from a phone by QR code and reusing data from a previous posting. — [CL what's new](https://www.craigslist.org/about/whats-new)

**Contact and the anonymizing relay (privacy)**
- Contact options are email with the CL mail relay, phone/text, and chat. — [CL help: contact info](https://www.craigslist.org/about/help/posting/features/contact-info)
- Mail relay:
  - "craigslist creates a randomized custom email address for each posting", for example `…@sale.craigslist.org`; replies come from `…@reply.craigslist.org`.
  - Limits: "The 'real name' field (e.g. Jane Doe) in your email program is visible to the recipient. Any contact information in the body of your message will pass through unaltered."
  - Threads "can continue for up to 4 months". Deleting a posting does not stop a conversation; to stop one, use the flagging links in the email.
  — [CL help: mail relay](https://www.craigslist.org/about/help/posting/features/contact-info/email/mail-relay)
- "craigslist does not have any mail viewing services on the website or app." — [CL help: where are my emails](https://www.craigslist.org/about/help/faqs/where_email)
- Chat:
  - The poster turns it on per posting and can switch it off later, and "Both the poster and the responder must be logged in". There is a "block" button.
  - "Requests for your personal email address or phone number may be a scam."
  — [CL help: chat](https://www.craigslist.org/about/help/posting/features/contact-info/chat)
- Phone: the "show my phone number" box must be checked; "phone calls OK" displays "call" and "text/sms OK" displays "text" before the number. — [CL help: phone/text](https://www.craigslist.org/about/help/posting/features/contact-info/phone-text)

**Lifespan, renewing, reposting, autorepost**
- "Paid postings are live on the site for 30 days." "Free postings are live on the site for between 7 and 45 days." Event postings last according to their dates. Publishing is "a one time charge" with no renewal fees. — [CL help: lifespan](https://www.craigslist.org/about/help/faqs/lifespan)
- "Free postings can be placed at the top of the listings every 48-72 hours by clicking the 'renew' link… Renewing applies to free postings only." — [CL help: renew](https://www.craigslist.org/about/help/posting/modify/renew)
- Reposting is for paid postings only and creates a copy. "There are no free reposts for paid postings. A repost is a new posting and must be paid for." A repost always goes to the same site. — [CL help: repost](https://www.craigslist.org/about/help/posting/modify/repost)
- From the changelog: "autorepost: Enable autorepost to choose how often to automatically make a new paid posting"; "renew all: Click to renew eligible free ads via the account homepage or a weekly email"; and paid-posting stats on the account homepage. — [CL what's new](https://www.craigslist.org/about/whats-new). Autorepost requires saved payment cards. — [CL help: autorepost](https://www.craigslist.org/about/help/autorepost)
- Editing has four options: edit the text, category or attributes; update images; edit the location; or delete. Time spent deleted counts toward the lifespan, and a posting can be undeleted. — [CL help: edit](https://www.craigslist.org/about/help/posting/modify/edit); [CL help: delete](https://www.craigslist.org/about/help/posting/modify/delete)

### Inferences
- Saved searches with alerts:
  - send digest alerts capped at about 20 items, newest first, with adaptive frequency;
  - include edited and renewed tasks that now match;
  - let users edit a saved search, which Craigslist does not allow;
  - offer push as well as email.
- Let people favorite and hide tasks or helpers without signing in, and merge the lists into the account on sign-in. The "hidden" list doubles as a personal mute.
- Moderation: auto-remove community flags above a threshold, then send them to a human review queue, and let compliant posts be reworded and reposted.
- Messaging privacy: copy the relay but fix its leaks. Mask phone numbers and emails inside messages before a booking (Craigslist passes them through unaltered), don't show real names before booking, and let threads expire.
- Limit bumps (Craigslist allows one every 48–72 hours) and expire task posts automatically after the task date. Craigslist's 7–45-day lifespans are built for goods, not dated tasks.

### Gaps
- Not published, so not found: the alert cadence in actual minutes or hours, the number of flags that triggers removal, and the free-post lifespan for each category.
- Specific posting-frequency limits, such as the often-cited "one post per item per 48 hours", are not in the pages I fetched. The prohibited list only bans "overposted" and "cross-posted" content.

## 5. What makes the layout space-efficient, what changed in recent redesigns (2022–2026), and how did users react?

### Takeaway
Craigslist is dense because it is text-first:
- one homepage holds the entire taxonomy (about 130 category links plus 51 forums);
- list rows are a single line (title, price, location), and list view shows no images;
- filters live in a left column on desktop and behind a single icon on mobile;
- there is almost no chrome.

Its founder defends this as "simple and fast". The 2022–23 move to a JavaScript search app, with gallery as the apparent default and view settings that sometimes reset, frustrated people who scan. Craigslist has since added features that address those complaints (preview pane, oldest sort, 1,000-mile radius, price histogram, filter buttons), but its changelog is undated, so the timing is inferred.

### Cited Findings
- Craig Newmark, September 2022, as summarized from a PC Magazine interview: the look persists "Because that serves people better… people want stuff that is simple and fast and gets the job done"; "It's fast and easy for people, and that's a big deal"; "Functional is beautiful." — [Slashdot, 2022-09-16](https://tech.slashdot.org/story/22/09/16/2123239/why-craigslist-still-looks-the-same-after-25-years)
- Slashdot commenters on that story:
  - Praise: speed ("a web interface designed for 768kbps DSL (or even AOL dialup) is insanely fast on multi-megabit connections"), "their search functionality is literal, not algorithmic", and local results without out-of-state ads.
  - Criticism: the site "has zero functionality if javascript is disabled", relevant results sit far down the list "beneath dealer ads", and "it is hard to do searches well".
  — [Slashdot, 2022-09-16](https://tech.slashdot.org/story/22/09/16/2123239/why-craigslist-still-looks-the-same-after-25-years)
- Homepage density on 2026-11-14: every category of every section as plain text links on one page, namely community (16), services (21), housing (10), for sale (45), jobs (31), gigs (8) and resumes. The same page also holds 51 discussion forums, a four-week event calendar, safety and scam links ("avoid scams & fraud", "personal safety tips"), and a 15-language selector (Spanish is `?lang=es&cc=mx&setlang=1`). — [Austin homepage](https://www.craigslist.org/area/austin)
- List view is "posting titles only, no images". On desktop, view and filters sit to the left and below the search bar; on mobile both are behind a three-line icon. — [CL help: display](https://www.craigslist.org/about/help/searching/display); [CL help: filtering](https://www.craigslist.org/about/help/searching/filtering)
- The search page is a thin HTML shell: one loader script, a JSON-LD `SearchResultsPage` breadcrumb, and a no-JS fallback list of results (262 items for Austin services). The rest is drawn in the client. — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb)
- Changes listed on "what's new" (undated): paid-posting stats, autorepost, renew all, a category selector on favorites, autosuggest, the free checkbox and the all-categories "free" view, QR-code image upload, reusing previous posting data, "more results in" links, homepage icons, filter buttons, preview mode, 1,000-mile radius, oldest sort with $→$$$ labels, the price bar chart, and search tips. — [CL what's new](https://www.craigslist.org/about/whats-new)
- User reactions:
  - February–March 2023: gallery kept coming back as the default and layouts varied within a region; the suspected cause was a cookie that did not persist. — [SearchTempest community thread](https://searchtempest.zendesk.com/hc/en-us/community/posts/14284430829075-CL-page-layout-defaults-to-gallery-each-time)
  - April 2023: a woodworking-forum post said search "seemed to have been upgraded" but no longer allowed wider-area search, sorting, or title-only search, and felt less capable than Facebook Marketplace's. This comes only from a search-result summary, because the page returned HTTP 403 to me. — [Sawmill Creek forum](https://sawmillcreek.org/archive/index.php/t-303161.html)
  - A third-party explainer (an SEO-style site, low reliability) says the newer format stresses grid and gallery views with larger images, that many users found it hard to adjust to, and it recommends switching to list view to scan. Also from a search-result summary only. — [searchallcraigslist.org](https://www.searchallcraigslist.org/why-craigslist-changed-its-format-the-revealing-story/)
  - (older, 2013) A price-first list test drew complaints, while grid view was called "much quicker". — [Garage Journal forum](https://www.garagejournal.com/forum/threads/does-everyone-else-hate-the-new-craigslist-format-as-much-as-me.210883/)

### Inferences
- Why the density works:
  - one result per line, with only the fields that separate one ad from another (title, price, place, date);
  - no avatars, badges or carousels;
  - text that loads instantly;
  - URLs that hold the whole state;
  - a homepage taxonomy that removes navigation steps.
- Users judge postings by title, so Craigslist's density depends on title quality, which it doesn't enforce. The Austin services feed shows the result in §6.
- Lessons from the redesign:
  - Don't switch the default view to image-first for text-heavy categories.
  - Keep view and sort choices saved reliably.
  - Don't remove power-user controls (title-only, sorts, wide-area search) when relaunching. Craigslist later restored or extended several of them, though the undated changelog means that timing is inferred.
- Copy the desktop "preview" split pane (list on the left, posting on the right). It keeps the list dense while making a task's details one click away, and it suits a 1280-px desktop layout.
- Language: Craigslist keeps the same URLs and switches language with a `lang` parameter plus a `setlang` flag. This matches TasksNearMe's language-free URLs with a language preference.

### Gaps
- I found no official announcement or launch date for the new search UI, and no coverage of the 2022–2023 search redesign in reputable tech press. User reaction comes only from forums.
- I found no quantitative data on user reactions, such as surveys or traffic changes.

## 6. Which Craigslist criticisms (scams, low trust, no reviews) should a modern marketplace avoid, while keeping its strengths?

### Takeaway
Craigslist's trust model offers anonymity, community flagging and advice to "deal locally, face-to-face". That fails exactly where a task marketplace operates:
- strangers come into the home, which Craigslist's own safety page says not to allow;
- there are no reviews, identity checks or payment protection;
- flagging is slow and incomplete (a 2016 study found it caught about half of scam rentals);
- the services feed is spam-heavy, with phone numbers and emoji in titles, loan spam and miscategorized posts.

The strengths worth keeping are speed, density, plain categories, URL-addressable filters, browsing and favorites without login, relay contact, and approximate locations.

### Cited Findings
- A 2016 study (Park, McCoy and Shi, *Understanding Craigslist Rental Scams*, Financial Cryptography 2016) analyzed "more than 2 million listings on Craigslist over a period of five months". — [NYU Tandon, 2016-03-02](https://engineering.nyu.edu/news/why-do-people-think-craigslist-isnt-safe-new-study-because-it-isnt); [dblp](https://dblp.org/rec/conf/fc/ParkMS16)
- News coverage of that study reports:
  - Craigslist caught only about 47% of the fake rental ads, flagging them on average about 10 hours after posting;
  - the most common scam was a fake rental that pushes victims to buy a credit report (the scammer earns a referral commission);
  - cloned listings at below-market rents asked for wired deposits.

  Coverage gives different detection rates: 47% overall, 57% for one category. I read summaries of the coverage, not the paper. — [EurekAlert](https://www.eurekalert.org/news-releases/673158); [Phys.org: "Study finds Craigslist catches barely half of scam rental listings"](https://phys.org/news/2016-03-craigslist-scam-rental.html); [NYU Tandon: "Renter Beware"](https://engineering.nyu.edu/news/renter-beware-study-finds-craigslist-catches-barely-half-scam-rental-listings)
- Craigslist's own scam guidance:
  - "Deal locally, face-to-face"; don't "provide or accept payment before meeting in person".
  - Requests to wire money, pay with gift cards or deposit a cashier's check are scams, and "escrow service can be a scam".
  - "Beware of: offers involving shipping or movers… 'guaranteed' transactions or payment processing services… requests for a 'code' or 'verification' - these are always a scam".
  — [CL help: avoiding scams](https://www.craigslist.org/about/help/safety/scams/avoiding)
- In-person safety advice: "Insist on a public meeting place like a bank or police department… Do not meet in a secluded place or invite strangers into your home." — [CL help: in-person transactions](https://www.craigslist.org/about/help/safety/in-person)
- For fraud, Craigslist points users to the FTC, the FBI's IC3 and state attorneys general, and to local police for in-person fraud. — [CL help: reporting scams](https://www.craigslist.org/about/help/safety/scams/reporting)
- No reputation layer: Craigslist's account features are drafts, history, settings, saved searches, alerts and favorites. There are no ratings, reviews or public profiles. — [CL help: account features](https://www.craigslist.org/about/help/account/features)
- Practitioner guides tie scam exposure to the missing identity verification, reviews and payment protection, and note that moderation relies on user flagging. These are commercial blogs, not research, and I saw only search-result summaries. — [OneRep](https://onerep.com/blog/is-craigslist-safe); [Omniwatch](https://www.omniwatch.com/blog/craigslist-scams/)
- Craigslist admits imperfect moderation: "no moderation system is perfect, and a small percentage of ads removed are compliant". — [CL help: flagging](https://www.craigslist.org/about/help/faqs/flagging)
- The relay has privacy leaks: the sender's real-name field is visible, and contact details in a message body "pass through unaltered". — [CL help: mail relay](https://www.craigslist.org/about/help/posting/features/contact-info/email/mail-relay)
- Quality observed in the Austin services feed on 2026-11-14 (no-JS fallback; phone digits redacted here):
  - All-caps, emoji-heavy titles with phone numbers, such as "🚚100HR_ BEST RATES🚚 EXPRESS SERVICE 🚛BEST MOVERS 512-…" and "AFFORDABLE 👍MOVERS LOCAL $99/HR TWO MAN 🚛🏃🏃".
  - Financial spam in services: "Hard Money Loans for Fix/Flip…", "✅ Startup Funding, Business Loans…", "💎📈 INVESTOR... CAPITAL MULTIPLICATION. INSTANT ROI. JUST WATCH. 📈💎".
  - A kitten for sale ("White Mainecoon kitten"). Pet sales are prohibited, and services is the wrong category.
  - Every row shows "$0" as the price.
  — [Austin services search](https://www.craigslist.org/search/area/austin?cat=bbb); [CL prohibited list](https://www.craigslist.org/about/prohibited)
- On Slashdot, a commenter complained that relevant results appear far down, "beneath dealer ads". — [Slashdot, 2022-09-16](https://tech.slashdot.org/story/22/09/16/2123239/why-craigslist-still-looks-the-same-after-25-years)

### Inferences
- **Keep:**
  - instant, dense, text-first result lists;
  - a flat, plain-language category list;
  - all filter and sort state in canonical URLs;
  - browsing and favorites with no login;
  - a per-conversation relay;
  - approximate location (ZIP circle or neighborhood) until booking;
  - community flagging as one input among several;
  - posting lifespans and bump limits.
- **Fix:**
  - **Identity:** verify phone and ID for helpers.
  - **Reviews:** reviews tied to completed bookings, so ratings can't be posted without a real transaction.
  - **Payments:** in-app payment with funds held until the work is done. Craigslist's "never pay before meeting" rule can't work for in-home tasks.
  - **Structured posts:** a required budget or price field with no "$0"; title rules that forbid phone numbers, URLs, all caps and emoji runs; automatic checks for the wrong category; duplicate collapsing.
  - **Moderation:** flag thresholds plus human review with a service-level target, set against the roughly 10-hour average reported for Craigslist.
  - **Contact masking:** mask phone numbers and emails in messages before booking.
  - **Safety for in-home work:** guidance and protections for jobs at home, since Craigslist's advice is "don't invite strangers into your home". For example: verified helpers, booking records, check-in, and an in-app support line.
- Moving help needs particular care: Craigslist itself lists "offers involving shipping or movers" as a red flag. Moving tasks should get extra scrutiny of posts and payments.

### Gaps
- I found no study after 2016 that measures how common scams are on Craigslist, and no data specific to the services or gigs sections (the 2016 study covered rentals).
- I did not locate FTC Consumer Sentinel or IC3 statistics broken out by platform for Craigslist.
