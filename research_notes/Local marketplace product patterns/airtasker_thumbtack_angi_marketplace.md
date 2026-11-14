# Task-posting and local-discovery patterns: Airtasker, Thumbtack, Angi, Facebook Marketplace (researched 2026-11-14)

## Airtasker: browse view, task page, public questions, task alerts, offer counts and states, badges and response signals

### Takeaway
Airtasker is the closest match to TasksNearMe (post a task with a budget → Taskers make offers → poster assigns one → payment held → completion and mutual reviews). Its browse page is a filterable list: "Category", a radius around a place "& remotely", "Any price", "Other filters", "Sort". A task page shows an Open → Assigned → Completed status row, a "Task Budget" box, details, offers and public comments. Contact details are banned from every public area, attachments included, and private messages open only after assignment. Offers are scored, and the highest-scored one is labelled "Top Offer". Taskers can subscribe to keyword task alerts.

### Cited Findings
**Model, markets, money**
- One English-language platform in six markets (Australia, US, UK, Ireland, New Zealand, Singapore), each with its own URLs, currency, service categories and locations. Posting and browsing are free. Airtasker takes a service fee on completed tasks and offers an optional paid membership for posters. Payment is held in "Airtasker Pay" until the task is complete, then released to the Tasker minus fees when the Tasker requests payment — [Airtasker llms.txt](https://www.airtasker.com/llms.txt)
- Rebookings: Taskers pay no service fee on a rebooking, only the standard 1.9% transaction fee (July 2025) — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- Pricing guidance: Airtasker recommends about $25/hour for basic tasks and up to $100 for professional or specialist services, and sets no minimum rate (AU context) — [Finder AU guide](https://www.finder.com.au/money/guide-to-airtasker-all-your-questions-answered) (search excerpt)

**Browse tasks view (public, logged out, US site, Nov 2026)**
- The filter bar reads "Category", "30mi Atlanta GA 30303 & remotely" (a default 30-mile radius around a ZIP code, plus remote tasks), "Any price", "Other filters" and "Sort". The category menu includes "Cleaning", "Plumbing", "Electricians", "Moving" and "Web". A "0 new tasks" indicator is shown. Logged-out visitors see no task cards and are told to "Join Airtasker" or "Log in" "To see more tasks". Neither a list/map toggle nor the contents of the sort menu showed up in the fetched page — [Airtasker Browse tasks](https://www.airtasker.com/tasks/)
- Browse order moved from purely chronological to "a mix of time and relevance" (older, undated blog post introducing task recommendations) — [Airtasker blog: introducing task recommendations](https://blog-content.airtasker.com/introducing-task-recommendations/)
- A Tasker guide says Taskers can sort by price while browsing, and can ask posters to raise a low budget — [GigWorker: Airtasker](https://gigworker.com/airtasker/) (third-party; I could not confirm which sort options exist)

**Task page layout (public task page; the task itself is from 2017 but uses the current page template)**
- The page shows status labels "Open", "Assigned" and "Completed"; the title; "Posted by" with first name and last initial ("Neda V.") and a relative time ("over 9 years ago"); "Location" (here "Remote"); "To be done on" with a date; and a "Task Budget" box ($6). It has "More Options", "Report this task" and "Follow" controls. Each public comment has a "Report" link. Once the task is assigned, the page says "Neda V. assigned Shane C. to help with this task", shows an assignee card with rating "5.0" (22 reviews) and an "85%" completion rate, and no longer shows a "Make an offer" button. After completion, both parties' reviews appear on the task page — [Airtasker task page](https://www.airtasker.com/tasks/how-do-i-make-an-offer-private-4619498/)
- The same 2017 page shows the loophole that current rules close. The assignee's public comment says: "press assign next to the offer amount post your number in a photo and I can ring you" — [same task page](https://www.airtasker.com/tasks/how-do-i-make-an-offer-private-4619498/)

**Offers**
- To make an offer, a Tasker opens the task, selects "Make an Offer", enters a **total** price and adds a description of up to 1,500 characters. The offer must cover the full scope, including travel, petrol, tolls and equipment. Taskers can update an offer until it is accepted. Agreeing a price in the comments neither changes the offer amount nor assigns the task — [Airtasker Help: Everything Taskers should know about making an offer](https://support.airtasker.com/hc/en-au/articles/360020896011-Everything-Taskers-should-know-about-making-an-offer) (search excerpt; the page returned 403 to direct fetch)
- The poster's budget is a starting point. The app blocks an unusually low offer, relative to the budget, until a "fair amount" is entered. Once assigned, the Tasker is in a direct contract with the customer, and any price change is negotiated between them — [Airtasker Help: How should I decide what price to offer?](https://support.airtasker.com/hc/en-us/articles/360020895651-How-should-I-decide-what-price-to-offer) (search excerpt)
- **Offer ranking (rolled out by July 2025):** offers are scored, and the highest-scored one is marked "Top Offer". The factors are:
  - price relative to the customer's budget;
  - ratings (a consistent 5-star record);
  - completed tasks, checked for cancellations the Tasker caused;
  - skills (tasks completed in the same category);
  - trust (verified badges and no Community Guidelines breaches);
  - response time (speed and consistency);
  - rebookings by past customers.

  — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- **Experiments (July 2025):**
  - offer expiry times set by Taskers ("Early results show offers accepted over 20% faster");
  - "Recommended Taskers" by category and location, whom customers can invite to make an offer;
  - AI help for customers to write clearer tasks.

  — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- Taskers can be invited directly to a task — [Airtasker Help: Can I ask a specific tasker to work on my task](https://support.airtasker.com/hc/en-us/articles/200956010-Can-I-ask-a-specific-tasker-to-work-on-my-task) (title-level)

**Public questions and contact-detail rules**
- "For your privacy and security, we don't allow sharing private contact details in public areas of the site. This includes on comments and on attachments for tasks or your profile." Contact details include full names, phone numbers, email addresses and complete street addresses — [Airtasker Help: Why can't I post my contact information](https://support.airtasker.com/hc/en-au/articles/18352435098393-Why-can-t-I-post-my-contact-information) (search excerpt; 403 to fetch)
- The US poster guidelines extend "private contact details and third party links" to business websites, social media profiles, personal emails, phone numbers, addresses and personal websites — [Airtasker US Posters Community Guidelines](https://www.airtasker.com/us/community-guidelines-poster) (search excerpt)
- Contact information may be shared only after an offer is accepted, "through our private message system" — [Airtasker UK Posters Community Guidelines](https://www.airtasker.com/uk/community-guidelines-poster); [Airtasker IE Posters Community Guidelines](https://www.airtasker.com/ie/community-guidelines-poster) (search excerpts)
- Private messages open only once a task is assigned. Before that, Taskers ask their questions in the public comments — [Airtasker Help: making an offer](https://support.airtasker.com/hc/en-us/articles/360020896011-As-a-Tasker-what-should-I-know-before-making-an-offer) (search excerpt)
- Tasks are publicly visible, so posters are told not to put their "full name, address, email, social media accounts or phone number in the task description or in any comments" — [Airtasker Help: safety tips after posting a task](https://support.airtasker.com/hc/en-us/articles/202402924-What-are-some-safety-tips-I-should-follow-after-posting-a-task) (search excerpt)
- Taskers must not share private contact details or third-party links "in any public areas of the site including in any comments and attachments". Taking tasks off the platform is not supported, either at the offer stage or after assignment — [Airtasker AU Taskers Community Guidelines](https://www.airtasker.com/au/community-guidelines-worker/) (search excerpt)
- "Harvesting" and lead-generation tasks are not supported and can be cancelled. In one example, a comment that tried to move a sale off-platform was removed together with the task. Users flag violations with "Report as Inappropriate" on the task or its comments, or through Contact Us — [Airtasker UK Posters Community Guidelines](https://www.airtasker.com/uk/community-guidelines-poster) (search excerpt)

**Task alerts (Tasker side)**
- Setup: on the web, Settings → "Task alerts"; in the app, Account → "Set up task alerts". Each keyword is a short phrase of up to 5 words. An alert fires when the keyword appears in a task's title or description, so "paint" can match a car-cleaning task that mentions paint. Airtasker contrasts specific phrases ("small hedge trimming", "Ikea furniture assembly") with broad ones ("gardening"). Alerts can be narrowed by location and by in-person versus online. They arrive by push or email, the notification shows only the task title, and the "Keyword task alerts" boxes in notification preferences must be ticked — [Airtasker Help: How do I set up task alerts](https://support.airtasker.com/hc/en-us/articles/360015124312-How-do-I-set-up-task-alerts); [Airtasker Help: notification preferences](https://support.airtasker.com/hc/en-gb/articles/201078710-How-do-I-manage-my-notification-preferences) (search excerpts)
- July 2025: Task Alerts send "instant notifications" about newly posted tasks that match a Tasker's keywords — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)

**Badges, completion rate, response time**
- Badge catalogue (a 2017 post, updated later), added under Settings → Verifications:
  - ID badges: Police Check (added only without a "Disclosable Court Outcome"), Australia Post Digital iD, Working with Children (the check "only reflect[s] relevant records on the date that the check was completed"), Payment Method, Mobile ("Verified when you join Airtasker"), Facebook, LinkedIn, Twitter, and a COVID-19 vaccination badge;
  - Licence badges: Electrical, Plumbing and Gasfitting (customers are told to "see the paper version in person");
  - Partner badge: IKEA, whose holders get "exclusive access to hundreds of IKEA jobs in your area".

  — [Airtasker blog: Airtasker Badges](https://www.airtasker.com/blog/airtasker-badges/)
- ID Verified uses a third-party provider that checks government photo ID and, since October 2024, a live biometric face scan. A badge reflects a point-in-time check — [Airtasker Help (ID verification)](https://support.airtasker.com/hc/en-au/articles/115010428848) (search excerpt; exact article title not confirmed)
- Completion rate now counts the Tasker's last 20 tasks and excludes cancellations the customer caused (July 2025) — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- Airtasker tells customers that a high response rate and a quick response time show an engaged, communicative Tasker — [Airtasker Help: How do I know if a Tasker is right for me](https://support.airtasker.com/hc/en-ie/articles/25807868965017-How-do-I-know-if-a-Tasker-is-right-for-me) (search excerpt)
- "Top Tasker" awards are based on average rating, reviews and completion rate — [Airtasker's Top Taskers in Australia for 2023](https://www.airtasker.com/blog/airtaskers-top-taskers-in-australia-for-2023/) (search excerpt)
- Vendor claim: Taskers who show a Digital iD badge are more likely to be assigned work — [Australia Post case study](https://auspost.com.au/enterprise-gov/insights-and-reports/customer-stories/airtasker-digital-identity-case-study) (provider-sourced)

**City, category and neighborhood directory pages (US)**
- The furniture assembly page (fetched Nov 2026) shows:
  - **Header:** "Find a furniture assembly professional near you" and "Fill a short form and get free quotes".
  - **Ratings:** "Great rating - 4/5 (13330+ reviews)" and a category average of 4.98 from 892 reviews.
  - **Platform stats:** "2,230+ tasks completed", "3 average offers per task" and "25 minutes average time to receive offers".
  - **Tasker cards:** first name and last initial, city, rating and review count, badges ("ID Verified", "Criminal Background Check", "Mobile Verified") and a "Request a Quote" button. Example: "Parviz A, New York City: 5.0 (55)". The cards show no price and no completion rate.
  - **Recent tasks:** each shows only the title, budget, city and date, with no status and no link. Examples: "Put together my dresser" $100 Chino, CA, Nov 11th 2026; "Disassemble my murphy bed" $200 New York, NY; "Furniture assembly/tv installation" $120 Dallas, TX, Oct 14th 2026.
  - **Price ranges (low–high, median):** furniture assembly $90–$220 (median $144), chair $52–$160 (median $95), bed $88–$200 (median $125).
  - **Location links:** city pages (Houston, Dallas and others), neighborhood pages (Upper East Side, Park Slope, Washington Heights) and state pages.
  - **Review snippets:** each names the task and price ("Bed frame assembly", $50).

  — [Airtasker US: Furniture assembly](https://www.airtasker.com/us/services/furniture-assembly/)
- Cautionary example: a cost guide labelled US says "Last Updated on 15 December 2023". It shows $40–$60/hour (median $50) and a table of items (dining chair $20 … sliding-door wardrobe from $190), but its city prices are Australian (Brisbane $65–$360, Perth $50–$650), no currency is stated, and no data source is given — [Airtasker US furniture assembly cost guide](https://www.airtasker.com/us/costs/furniture-assembly/furniture-assembly-cost-guide/)

### Inferences
- **Browse filters to copy:** category; a radius in miles around a market or neighborhood with an "& remotely" switch (this fits computer help); a price range; an "Other filters" drawer (for example "open only" or "no offers yet"); and sort. A "new tasks since last visit" counter gives a sense of activity without inventing anything.
- **Task page skeleton:** status row (Open / Assigned / Completed); first name and last initial; a neighborhood or "Remote" rather than an address; a date line ("To be done on" or a flexible date); a budget box with "Make an offer"; details; an offers section; public questions with Report links; "Follow" or save. Once assigned: "X assigned Y", offers and questions close, and private messages open. After completion: both reviews on the task. This matches TasksNearMe's offer-based booking model directly.
- **Privacy rule to adopt:** no phone, email, full name, street address, social or website links in public questions, task descriptions, profiles, or attachments. Images need checking too, because the 2017 "post your number in a photo" comment shows image attachments being used to get around a text-only ban. The exact address goes only into the post-assignment private channel.
- **Offer hygiene:** the offer is a single all-in total price; a price agreed in comments has no effect; a minimum relative to the budget blocks lowballs; offers can expire (Airtasker saw faster acceptance in testing).
- **Offer ranking:** a "Top offer" score from price versus budget, rating, completions, category experience, verification, response speed and repeat hires. The UI should only display the score; computing it belongs in the domain layer.
- **Alerts:** short keyword phrases plus category and market or neighborhood filters, and an in-person versus remote filter. Airtasker's title-only notification makes it unclear why an alert fired, so TasksNearMe could include the category, neighborhood and budget.
- **SEO pages:** honest aggregate stats (average offers per task, median time to first offer, completed count), recent tasks shown with city or neighborhood only and no link, and low / median / high price ranges. They must be computed from real local data and dated. Airtasker's US-labelled guide carrying Australian data from 2023 is the failure mode to avoid.

### Gaps
- I could not see what "Other filters" contains or which options "Sort" offers on the live browse page; it renders only partly for logged-out visitors. Third-party sources confirm only price sorting. Labels often described for the app ("Available tasks only", "Tasks with no offers", "Closest to me") were not confirmed by any fetched source.
- I found no source confirming a list/map toggle on Airtasker's web browse page.
- The only task page I could open is a remote task from 2017. I could not confirm three things for a current in-person task: whether it shows the suburb only and when the exact address is released, the exact wording of any privacy notice above the questions box, or whether a public "Offers (N)" count is shown and whether other Taskers can see offer amounts.
- The help-centre articles on spam tasks ([link](https://support.airtasker.com/hc/en-us/articles/23276292518169-How-do-I-protect-myself-against-spam-tasks)) and scams ([link](https://support.airtasker.com/hc/en-au/articles/51229265215897-How-to-protect-yourself-from-scams)) returned HTTP 403, so their contents are known only from search excerpts.

## Thumbtack: request flow, quotes, Top Pro, response time, hires count, cost guides, project-matching questions

### Takeaway
Thumbtack is not a public task board. A customer searches for a service and ZIP, answers project questions, and is matched to pros, who pay per lead. Customers compare pros on reviews, price estimates and badges, then message or request quotes. The trust signals are "Top Pro" (now the Platinum tier of Pro Rewards: rating, background check and fast responses), verified versus unverified reviews, and public hire counts ("N hires on Thumbtack"). For discovery it uses city × service directory pages and cost guides built from its own project data.

### Cited Findings
**Request flow and matching**
- Older model: customers answered questions to "formalize a job request", which was sent to relevant pros. Now an algorithm matches the request to relevant local pros, who may be matched with a customer "simultaneously". Pros pay when they access or are matched with a lead, not when they win the job — [Housecall Pro: What is Thumbtack](https://www.housecallpro.com/resources/what-is-thumbtack-how-it-works/) (third-party)
- Thumbtack's design team wrote that the manual quoting model "made it hard to guarantee that there would be quotes for each and every customer request", which is why Thumbtack moved away from manual quotes toward algorithmic matching — [Thumbtack Design: Thumbtack's Product Strategy](https://medium.com/thumbtack-design/thumbtacks-product-strategy-d0cdb5d81c03)
- Customers can compare nearby businesses, read reviews, request quotes and chat with pros in the app. A response can include an initial estimate and/or a direct message — [Thumbtack App Store listing](https://apps.apple.com/app/852703300) (search excerpt)
- A consumer reviewer says customers usually "start hearing back from professionals within a day" — [Clark.com Thumbtack review](https://clark.com/save-money/thumbtack-review/)
- Lead prices are not published. They depend on job size, how many pros are available and the market, and pros set maximum lead prices — [Thumbtack Community: How are lead prices calculated?](https://community.thumbtack.com/discussion/656/how-are-lead-prices-calculated)

**Top Pro (sources conflict; newer behavior first)**
- **Current (Pro Rewards):** three tiers, Silver, Gold and Platinum, and "Platinum" is "Top Pro". Platinum reportedly needs a 4.7-star rating, a background check, a 75% response rate within one hour, and 2,400 points, mostly earned by responding to leads and completing bookings — [Thumbtack Community: What is Thumbtack Pro Rewards](https://community.thumbtack.com/discussion/207/what-is-thumbtack-pro-rewards-and-how-does-it-work) (search excerpt)
- The badge is shown on pro profiles and in search results — [Thumbtack blog: How we're rewarding our pros](https://blog.thumbtack.com/how-were-rewarding-our-pros-for-their-partnership-63fe8079d0c4)
- A badge with a year ("2024 Top Pro") is awarded only if the pro was Platinum in at least 2 of the year's 4 rewards periods. Otherwise the badge appears only while the pro is currently Platinum — [Thumbtack Community: Top Pro Badge 2024](https://community.thumbtack.com/discussion/comment/5820/)
- **Older (Pro Center):** at least five verified reviews in the past 12 months; a new class picked twice a year (early January and early July); how pros handle upset customers also counts; "only four percent of all pros" had been awarded it — [Thumbtack Pro Center](https://pro-center.thumbtack.com/?p=21959) (search excerpt; date unknown, probably before Pro Rewards)
- An unofficial page gives a different response rule: replying to new customers within 24 hours at least 75% of the time — [Google Sites page](https://sites.google.com/view/fmmilspec/página-inicial/awards) (unofficial; conflicts with the one-hour rule)
- Customer-facing meaning: "highly rated across several reviews from Thumbtack customers" — [Thumbtack Safety](https://www.thumbtack.com/safety/)
- Criticism: some pros say the badge mostly rewards responding to a high volume of leads and not necessarily "better quality". A moderator said badges go only to Platinum "so that pros with those badges stand out" — [Thumbtack Community: Top Pro Status](https://community.thumbtack.com/discussion/2075/top-pro-status); [Thumbtack Community: I reached the top pro goals but didn't get the badge](https://community.thumbtack.com/discussion/1595/i-reached-the-top-pro-goals-but-didnt-get-the-badge) (search excerpts; I could not tell which thread holds which quote)

**Reviews, hire counts, directory pages**
- "Verified reviews are from customers who hired a pro on Thumbtack". Unverified reviews come from customers who found the pro elsewhere — [Thumbtack Smart Hiring](https://www.thumbtack.com/safetyguidelines/)
- The Austin furniture assembly directory is titled "The 10 Best Furniture Assembly Services in Austin, TX 2024" and states there are "171 five star Furniture Assemblers in Austin, TX on Thumbtack". Pro cards show "Top Pro" and a hire count, for example FixTman LLC "5187 hires on Thumbtack", Apex Home Improvement Solutions 643, Andrii Korostin 47, BlueFiks LLC Austin 18 — [Thumbtack Austin furniture assembly](https://www.thumbtack.com/tx/austin/furniture-assembly) (search snippet; the page renders in the browser and returned no content to fetch)
- Thumbtack builds the same grid for nearby suburbs and adjacent categories: [Round Rock furniture assembly](https://www.thumbtack.com/tx/round-rock/furniture-assembly), [Austin furniture movers](https://www.thumbtack.com/tx/austin/furniture-movers), [Austin furniture removal](https://www.thumbtack.com/tx/austin/furniture-removal-services) (search listing)

**Cost guides**
- Furniture assembly, national: average $148; typical range $120–$150; low end about $70–$75; high end $324–$429 — [Thumbtack: furniture assembly cost](https://thumbtack.com/p/furniture-assembly-cost) (search excerpt)
- Outdoor furniture assembly: the national average runs about $125–$263, and "most people pay around $182" — [Thumbtack: outdoor furniture assembly cost](https://www.thumbtack.com/p/outdoor-furniture-assembly-cost) (search excerpt)
- City-level "fixed price" figures exist. For Columbus, OH, search showed an average of $80–$100, a lowest price of $60 and a highest of $210 (exact URL not confirmed) — [Thumbtack cost guide family](https://thumbtack.com/p/furniture-assembly-cost) (search excerpt)
- Thumbtack describes its cost pages as "estimated ranges based on real Thumbtack project data". Localized pages follow a `/p/{city}-{service-slug}-prices` URL pattern — [Thumbtack llms.txt](https://www.thumbtack.com/llms.txt) (search excerpt; direct fetch was empty)
- The most detailed published method is the Home Care Price Index. It draws on more than 1M home projects completed on Thumbtack, with prices from nearly 3M projects requested between Jan 1, 2022 and Dec 31, 2024. It weights projects by how often they are recommended per year, uses a quarterly moving average, and falls back to national averages where a region lacked enough estimates — [Thumbtack: Home Care Price Index relaunch](https://www.thumbtack.com/guide/content/thumbtack-relaunches-home-care-price-index-to-provide-deeper-insights-into-home-maintenance-trends); [Thumbtack: New findings from the HCPI](https://www.thumbtack.com/guide/content/new-findings-from-our-home-care-price-index) (search excerpts)
- Housecall Pro says Thumbtack does not share its cost data publicly — [Housecall Pro](https://www.housecallpro.com/resources/what-is-thumbtack-how-it-works/) (third-party)

### Inferences
- **Category intake questions:** Thumbtack's per-category project questions are a good model for TasksNearMe's posting flow. Examples: assembly (item count and type, brand, tools on hand); moving help (rooms, stairs or elevator, truck needed); yard cleanup (area size, haul-away); light cleaning (rooms and bathrooms, supplies); computer help (device, remote or in person). Structured answers make offers comparable and could feed a suggested-budget range.
- **Cost guides:** the transferable pattern is a typical range plus low and high ends at national and city level, computed from the platform's own completed jobs, with a fallback to a wider area when there is too little local data. TasksNearMe could compute Austin × category ranges from accepted offers or completed bookings, show the median and middle range, the sample size and the date range, and hide or fall back when the sample is small.
- **Badges:** Thumbtack ties its top badge to response speed and lead volume and gets credibility complaints for it. A TasksNearMe top-helper badge should require quality as well (rating, completion rate, verified identity) and should expire or recompute on a fixed schedule.
- **Hire counts:** a public count ("N tasks completed on TasksNearMe") is a strong trust signal. A new marketplace in one city will mostly show small numbers, so a "New helper + ID verified" treatment beats showing "0".

### Gaps
- Thumbtack's directory, cost-guide, help-centre and 2025 "One App for Your Home" relaunch pages render in the browser and returned nothing to fetch. Customer-facing labels such as "Responds in about X min", "Online now" or "In high demand" are not verified, and the current wording of the request questions could not be captured.
- No official source explains how city-level cost ranges are sampled, how many projects feed each range, or how outliers are handled. Only the Home Care Price Index method is documented.
- The current Top Pro criteria are documented only in community forum posts, which conflict with an older Pro Center page.

## Angi: service directories, cost guides, reviews, "Angi Certified/Approved", instant booking vs. request quotes

### Takeaway
Angi offers two paths. One is fixed-price "book now" services (Angi Services): an upfront price, payment through Angi, and its guarantee only on that path. The other is "request and compare quotes" lead matching to vetted pros. Its trust badge, now called "Angi Approved" (earlier "Angi Certified"), requires a background check on the owner or manager, proof of licensing, and a minimum rating (3.5★ now, 3★ earlier). Its cost guides rest on more than 2 million costs reported by homeowners after their projects.

### Cited Findings
**Booking paths**
- Customers can "see their price and book services in an instant, or request and compare quotes from highly rated pros near them" — [Angi How it works](https://www.angi.com/how-it-works) (search excerpt; 403 to fetch)
- Booking and paying through the Angi Services product gives "a transparent, upfront price before you schedule with a pro" — [Angi FAQ](https://www.angi.com/landing/faq) (search excerpt)
- A third-party guide describes the two paths:
  - pre-priced services are booked on the spot, with the price set in advance and Angi handling payment;
  - for standard work, a fixed price and a chosen date beat collecting three estimates;
  - protections apply only when the job is booked and paid through Angi, and renovation-scale work is "almost always paid to the contractor", so the guarantee usually doesn't apply;
  - with quote requests, keep the list to two or three pros.

  — [Block Renovation: Angi vs. Thumbtack](https://www.blockrenovation.com/guides/angi-vs-thumbtack) (has a commercial interest)
- A 2026 comparison says instant booking suits standard, predictably priced work, and quote requests suit custom work whose cost depends on scope — [InstaService: Top 10 Home Service Platforms 2026](https://www.instaservice.com/blog/?p=38244) (competitor blog)

**Pro vetting badge**
- "Angi Approved" (help article dated Nov 21, 2025):
  - pros with at least one review must keep an average of "3.5 stars or higher";
  - "the business's owner, principal, or relevant manager must pass a criminal background check before entering our network";
  - pros must give "proof of licensing for the tasks they select that have licensing requirements within their coverage area";
  - "Angi will revoke the certification and advertising upon discovery that any business fails to maintain these requirements".

  — [Angi Help: Pro eligibility requirements](https://intercom.help/angi/en/articles/9269408-pro-eligibility-requirements)
- Older description: "Angi Certified" required an average of three stars or higher and a background check on the owner or principal, and was described as above "Angi Approved". This naming conflicts with Angi's own 2025 page — [Bob Vila: Angi review](https://www.bobvila.com/articles/angi-review)
- The 2021 FAQ says corporate accounts are not background checked and employees are generally not screened — [Angi FAQ (archived Apr 2021)](https://webcf.waybackmachine.org/web/20210411121506/https://www.angi.com/faq)
- Background checks were reportedly run through Checkr (2021 case study) — [Checkr customer story: Angi](https://2021.checkr.com/resources/customer-stories/angi)
- A home-inspector guide argues that much of the verification is self-reported — [InspectAndTest: Angie's List home inspectors](https://inspectandtest.net/guides/angies-list-home-inspectors/) (secondary blog)

**Reviews and guarantee**
- A review site says Angi checks each submitted review for authenticity and publishes only reviews from clients it confirms hired the pro — [Bob Vila: Angi review](https://www.bobvila.com/articles/angi-review) (secondary; no Angi source fetched)
- The Happiness Guarantee gives limited coverage and only when the job is booked and paid through Angi — [Bob Vila: Angi review](https://www.bobvila.com/articles/angi-review)
- Anecdotal complaint: a guarantee decision took more than 2 months and offered $8,200 against $12,750 in claimed damages — [ConsumerAffairs: Angi reviews](https://www.consumeraffairs.com/online/angies-list.html) (individual reports, not representative)

**Cost guides**
- Method: "over 400 projects and more than 2 million reported costs". Customers submit the total they paid after finishing a project, and Angi pairs it with the location, giving "national and local cost data from over 10,000 U.S. cities and towns". Outliers are removed. "Our project cost data is updated daily to reflect any new customer entries and updates live across our site" — [Angi: How We Get Our Cost Data](https://angi.com/standards/about-our-cost-data-page.htm)
- Angi asks for corrections at costquotes@angi.com, with example quotes or receipts, and keeps personal information private — [Angi: How We Get Our Cost Data](https://angi.com/standards/about-our-cost-data-page.htm) (search excerpt)
- An older HomeAdvisor-branded dataset was "compiled from homeowners reporting the cost of their projects from January, 1998 through August, 2019" — [HomeAdvisor Pro](https://pro.homeadvisor.com/r/?p=4292) (search excerpt)

### Inferences
- **Two booking modes:** fixed price for standard, small jobs (a single item assembled, a set yard size) and a budget-plus-offers flow for variable scope (moving help, larger cleanups). TasksNearMe could add a "book at a set price" path later for its most standard jobs. The guarantee and protections should apply only to jobs paid through the platform, which also discourages taking jobs off-platform.
- **Badge requirements in public copy:** state exactly what the badge checks and whom. Angi checks only the owner or manager, a limit that matters in a person-to-person market. Revoke the badge when a requirement lapses. Separate "verified" (what was checked) from "top-rated" (performance).
- **Cost data:** Angi's self-reported "total paid" method can be copied, but TasksNearMe has a better source in its own completed bookings. Label the data year and refresh cadence; Angi says "updated daily" while individual guides carry a data year, which looks inconsistent.

### Gaps
- Angi pages (how-it-works, FAQ, directory and cost guides) returned 403 to fetch. Current directory card fields (rating, review count, "Angi Certified" or "Approved" label, years in business, "Book now" vs "Request quote" buttons) and the current guarantee terms could not be confirmed.
- I found no Angi-authored source on how reviews are verified, only a secondary review site.

## Facebook Marketplace: location and radius, categories, map/list, price filters, "listed today", saved searches and notifications, response badges

### Takeaway
Marketplace is location-first. One location plus a radius drives the browse feeds. Richer filters live on search results: price, date-listed windows (24 hours, 7 days, 30 days) and sort by distance, date or price. Saved searches have a "Notify Me" bell, but delivery is reportedly slow or batched. Trust signals are light: ratings Facebook does not verify, badges such as "Very responsive", and since March 2026 AI-written profile summaries showing time on Facebook, friend count, listing history and ratings. Meta AI can now auto-answer "is this still available?" messages.

### Cited Findings
**Location, radius, filters, sort**
- Mobile steps: tap the location at the top of Marketplace, enter a city or ZIP, choose a custom radius instead of the suggested one, then "Apply". Desktop has an equivalent location control. Third-party guides disagree on radius limits (about 1–500 miles versus a 0.6-mile minimum). A VPN cannot change Marketplace's location — [Private Internet Access guide](https://www.privateinternetaccess.com/blog/how-to-change-location-on-facebook-marketplace/); [Comparitech guide](https://www.comparitech.com/blog/vpn-privacy/change-location-on-facebook-marketplace/) (third-party)
- A September 2026 critique of the iOS app:
  - on the Local page the only control is the "distance" radius, and the Explore and Local pages have no filter or sort, so buyers are "passively fed information";
  - search has "Recent" and "Saved" sections, and saved searches keep their price and distance filters;
  - sellers cannot set an expiry date, so time-sensitive posts such as moving sales stay live past their deadline (the critique proposes a mandatory "Expiration Date" field);
  - Marketplace "lacks crucial sorting tools for buyers".

  — [IXD@Pratt: Design Critique: Facebook Marketplace (iOS App)](https://ixd.prattsi.org/2026/09/design-critique-facebook-marketplace-ios-app-2/)
- Date filter windows: last 24 hours, last 7 days, last 30 days (default any date). Sort modes: Suggested, Distance (nearest first), Date listed (newest first, `creation_time_descend`), price low to high and high to low — [SerpApi: Facebook Marketplace API](https://serpapi.com/facebook-marketplace-api); [Apify FB Marketplace scraper](https://apify.com/unseenuser/fb-marketplace) (scraper documentation that mirrors the UI parameters)
- Sort is under Filters → "Sort by" (Distance or Date listed). Reportedly these controls are unavailable in mobile browsers — [Swoopa: Facebook Marketplace search tips](https://getswoopa.com/facebook-marketplace-search-tips) (vendor blog)
- A "Listed today" or "Posted within 24 hours" filter is described by marketing blogs but was not confirmed by an official source — [same search set](https://getswoopa.com/facebook-marketplace-search-tips)

**Saved searches and alerts**
- After running a search, tap the bell ("Notify Me") next to Filters. A "Saved Searches" section lets the user turn notifications on or off per search — [NoypiGeeks: Marketplace product alerts](https://www.noypigeeks.com/how-tos/facebook-marketplace-product-alerts/) (how-to blog)
- Reliability is disputed. Vendors of paid alert apps say native alerts are batched, sometimes hours late, and ranked by Facebook, and a whole category of third-party alert tools exists (Spottable, Scout, Distill.io) — [ScrapeCreators: Facebook Marketplace alerts](https://scrapecreators.com/blog/facebook-marketplace-alerts); [Spottable blog](https://spottable-lp.pages.dev/blog/fastest-facebook-marketplace-alerts-iphone) (vendors with a commercial interest)

**Seller signals, ratings, AI features**
- March 12, 2026 announcement:
  - Meta AI drafts listings from photos;
  - it suggests prices "based on similar items listed in the seller's area";
  - when buyers ask about availability, it can draft and send replies using the listing's description, availability, pickup location and price (sellers enable, preview and edit these);
  - a Meta AI summary at the top of a seller's Marketplace profile shows how long they've been on Facebook, friend count, listing history, the kinds of items they sell, and seller ratings;
  - sellers can offer shipping with prepaid labels.

  — [Meta Newsroom: Marketplace Meta AI tools (Mar 12, 2026)](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/)
- Seller reviews appear on the seller's Marketplace profile and on the listing. Facebook says it does not verify that each reviewer actually bought from the seller — [Facebook Help: How seller reviews work on Marketplace](https://www.facebook.com/help/android-app/2976188062670725) (search excerpt; the page returned only its title to fetch)
- Seller badges "Very responsive", "Super seller" and "Highly rated" appear in Facebook's help content on the buy-and-sell feature set for Groups — [Facebook Help: buy-and-sell feature set in groups](https://www.facebook.com/help/776978302394267) (search excerpt; group context, may differ from main Marketplace)
- A third-party blog says "Very Responsive" requires answering inquiries within about an hour on average and addressing at least 80% of messages — [OneShop: Facebook Marketplace badges](https://oneshop.com/blog/facebook-marketplace-badges) (unverified; no Meta source found)
- 2018: buyers and sellers can leave feedback on response time, friendliness and reliability — [Meta Newsroom: Marketplace Turns Two (Oct 2018)](https://about.fb.com/news/2018/10/marketplace-turns-two/amp/) (older behavior)
- Press calls the flood of one-tap "Is this still available?" messages a long-standing pain point that the 2026 AI replies target — [Ammon News: "Facebook Marketplace's new AI ends the 'is this available' nightmare"](https://en.ammonnews.net/print.php?id=89884) (headline-level)

### Inferences
- **One market and radius control:** a single "Austin + radius" (or neighborhood) control drives every feed, and power filters (category, price, date posted, sort by distance, newest or price) live on browse. TasksNearMe should offer filters on the main browse view, not only in search; Pratt's critique shows that leaving them out frustrates users.
- **Saved searches with alerts:** save the filters (category, neighborhood or radius, price, remote) and toggle notifications per search. Deliver promptly, without batching. Third-party alert apps for Marketplace show that slow native alerts push power users to scraping tools.
- **Expiry:** every task should carry a due date or window and auto-close, avoiding Marketplace's stale-listing problem.
- **Trust summary card:** Meta's AI profile summary is a cheap template: time on platform, tasks completed, categories, rating and response time. On TasksNearMe it can be computed directly rather than generated by AI.
- **Quick-question messages:** one-tap messages create noise. If TasksNearMe offers "quick question" chips on public questions, it needs limits and moderation.

### Gaps
- Facebook help pages returned only titles, so official badge criteria, radius limits and category lists could not be confirmed. Radius bounds conflict across third-party guides.
- I found no evidence that Marketplace shows listings on a map; the map appears only when picking a location. This could not be verified either way.
- I could not confirm a "Listed today" label or filter in the current UI from an official source.

## Which mechanics create a sense of activity, and which create spam or safety problems

### Takeaway
All four platforms rely on honest activity signals drawn from real data: offer counts and averages, time to first offer, "new tasks" counters, recent tasks with dates, hire counts, counts of local five-star pros, date-listed filters and saved-search alerts. Fabricated activity ("39 other people are viewing this item") is a documented dark pattern with enforcement history. I found no evidence that any of these four uses "X people viewed" counters. Most spam and safety problems come from public, open-to-anyone surfaces: Q&A or comments used to harvest contacts, push payment off-platform or sell leads; stale listings; ratings nobody verifies; and badges that reward volume over quality.

### Cited Findings
**Activity signals in use**
- Airtasker directory: "3 average offers per task", "25 minutes average time to receive offers", "2,230+ tasks completed", and recent tasks with budget, city and date, for example Nov 11th 2026 — [Airtasker US: Furniture assembly](https://www.airtasker.com/us/services/furniture-assembly/)
- Airtasker browse shows a "0 new tasks" indicator — [Airtasker Browse tasks](https://www.airtasker.com/tasks/)
- Airtasker sends instant keyword alerts, and its offer-expiry test sped up acceptance by more than 20% — [Airtasker Feature Hub Q3 2025](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- Thumbtack shows "N hires on Thumbtack" per pro and "171 five star Furniture Assemblers in Austin, TX" per page — [Thumbtack Austin furniture assembly](https://www.thumbtack.com/tx/austin/furniture-assembly) (search snippet)
- Marketplace has date-listed windows (24 h, 7 d, 30 d), a newest-first sort and "Notify Me" saved searches — [SerpApi](https://serpapi.com/facebook-marketplace-api); [NoypiGeeks](https://www.noypigeeks.com/how-tos/facebook-marketplace-product-alerts/)

**Fake activity as a dark pattern**
- The FTC staff report "Bringing Dark Patterns to Light" (Sept 2022) treats false activity messages ("39 other people are viewing this item") and invented counts ("28 people have added this to their cart" when two have) as deceptive social proof. It treats false urgency (fake countdowns) and false scarcity as separate categories — [AGG: The FTC Blacklists Dark Patterns](https://www.agg.com/news-insights/publications/the-ftc-blacklists-dark-patterns/); [FTC report page](https://www.ftc.gov/reports/bringing-dark-patterns-light) (FTC page not opened; examples via law-firm summary)
- A 2024 FTC/ICPEN/GPEN sweep found 21.5% of the websites and apps examined used notifications or other social proof to push subscription sign-ups — [TechCrunch (Jul 10, 2024)](https://techcrunch.com/2024/07/10/ftc-study-finds-dark-patterns-used-by-a-majority-of-subscription-apps-and-websites)
- The New York Attorney General's case against Fareportal covered false claims that a specific number of consumers were looking at the same tickets, plus fake countdowns. It ended with $2.6M in disgorgement and costs — [JD Supra: The FTC Blacklists Dark Patterns](https://jdsupra.com/legalnews/the-ftc-blacklists-dark-patterns-4807568) (search-summary level; not opened)
- These staff reports do not themselves find any practice illegal — [same summaries](https://www.agg.com/news-insights/publications/the-ftc-blacklists-dark-patterns/)

**Spam and safety problems on public surfaces**
- Airtasker bans contact details in comments, attachments and profiles, bans harvesting and lead-generation tasks, removes comments that move a deal off-platform, and offers "Report as Inappropriate" — [Airtasker Help: contact information](https://support.airtasker.com/hc/en-au/articles/18352435098393-Why-can-t-I-post-my-contact-information); [Airtasker UK Posters Community Guidelines](https://www.airtasker.com/uk/community-guidelines-poster) (search excerpts)
- Workaround seen in a 2017 Airtasker comment: "post your number in a photo and I can ring you" — [Airtasker task page](https://www.airtasker.com/tasks/how-do-i-make-an-offer-private-4619498/)
- Airtasker names requests for sensitive personal information, or for payment arranged outside Airtasker, as scam warning signs. It also has a dedicated help article on spam tasks — [Airtasker Help: How to protect yourself from scams](https://support.airtasker.com/hc/en-au/articles/51229265215897-How-to-protect-yourself-from-scams); [Airtasker Help: spam tasks](https://support.airtasker.com/hc/en-us/articles/23276292518169-How-do-I-protect-myself-against-spam-tasks) (search excerpts; 403)
- Facebook does not verify that reviewers bought from the seller — [Facebook Help: seller reviews](https://www.facebook.com/help/android-app/2976188062670725) (search excerpt)
- UK bank TSB reported that Facebook accounted for 73% of its "purchase fraud" cases — [Saga: Facebook Marketplace scams](https://saga.co.uk/money-news/facebook-marketplace-scams) (secondary report of bank data; period not confirmed)
- Marketplace listings have no expiry, so outdated posts stay live — [IXD@Pratt critique (Sept 2026)](https://ixd.prattsi.org/2026/09/design-critique-facebook-marketplace-ios-app-2/)
- Public Marketplace listing data is widely scraped by commercial tools (search, sort and date windows exposed as API parameters) — [Apify FB Marketplace scraper](https://apify.com/unseenuser/fb-marketplace); [SerpApi](https://serpapi.com/facebook-marketplace-api)
- Pros criticize Thumbtack's Top Pro as rewarding responsiveness and lead volume more than quality — [Thumbtack Community: Top Pro Status](https://community.thumbtack.com/discussion/2075/top-pro-status) (search excerpt)
- Angi's guarantee covers only jobs booked and paid through Angi, and homeowners complain about payouts — [Bob Vila](https://www.bobvila.com/articles/angi-review); [ConsumerAffairs](https://www.consumeraffairs.com/online/angies-list.html) (anecdotal)

### Inferences
- **Safe activity signals for TasksNearMe:**
  - offers on a task ("4 offers"), always true;
  - "new since your last visit" on browse;
  - per neighborhood or category: tasks posted this week, median time to first offer, average offers per task;
  - recent completed tasks with neighborhood, budget band and date, but no link, name or address;
  - per helper: tasks completed and repeat customers.

  Show each only when the sample is large enough, and say what it counts and over what period.
- **Avoid:** viewer counts ("X people viewed"), "Y helpers looking now", countdown timers, and any count that is not computed from real events. They are FTC-flagged dark patterns, have drawn state enforcement, and add little beside real offer counts.
- **Public Q&A is the riskiest surface:**
  - check text and image attachments for phones, emails, URLs, handles and street addresses;
  - block or hold matches for review and say why;
  - rate-limit questions per user per task;
  - disable questions once a task is assigned;
  - put Report on every question and answer;
  - release the exact address and the private channel only after assignment.
- **Lead and harvesting abuse:** forbid tasks that exist to collect contacts or resell leads. Watch for posters with many tasks and no assignments, and for helpers who send copy-paste offers across many tasks.
- **Staleness:** due dates, auto-expiry and an "open only" default on browse prevent Marketplace-style stale listings.
- **Reviews:** only from a completed booking. Thumbtack separates verified from unverified reviews; Facebook doesn't verify at all and is the counter-example.
- **Badges:** combine quality and speed, recompute on a schedule, and show exactly what was verified and when. Airtasker's badges are explicitly point-in-time.

### Gaps
- I found no evidence on whether any of the four shows view counts ("X people viewed this task"), so I can't say whether that pattern works or causes harm in local services specifically.
- I found no primary data comparing spam or scam rates across these platforms. The Facebook scam figure is a UK bank statistic reported second-hand, and a US social-media-scam loss figure seen in search could not be tied to a citable primary source, so it is left out.
- The FTC report and the NY AG Fareportal materials were not opened directly; their details come from law-firm and press summaries.
