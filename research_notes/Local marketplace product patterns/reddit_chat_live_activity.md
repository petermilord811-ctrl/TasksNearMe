# Reddit discussion and chat UX, plus "active site" mechanics, for a local-services marketplace (TasksNearMe)

Source notes: Reddit's help center (support.reddithelp.com) and redditinc.com returned 403 or blocked errors to my fetcher. Many Reddit citations below are therefore **mirrors**: third-party Reddit front ends (redlib/libreddit hosts such as `lr.*.psf.lt`, `redlib.*`, `*.lr.ggtyler.dev`) that show the original reddit.com post with the same post id, for example `/r/reddit/comments/1jf1bxy` is reddit.com/r/reddit/comments/1jf1bxy. Where I had only a search-result summary and not the page itself, the bullet says so. Internal context comes from the TasksNearMe blueprint (`docs/blueprint/01-product-brief.md`, `docs/blueprint/11-initial-backlog.md`).

## 1. Reddit threads: nested replies, collapse, voting and score display, sort orders (how "Best" is computed), OP markers, flair, awards (2023+), moderation tools, composer

### Takeaway
Reddit's thread UX rests on four things:
- **Vote-based ranking.** The default "Best" sort uses the lower bound of a Wilson score confidence interval. Reddit's own code uses **80% confidence (z ≈ 1.2816)**, not the 95% in Evan Miller's article.
- **A small set of other sorts.** Top is net score, Controversial is magnitude^balance, plus New and Old. Q&A boosts question-and-answer pairs where the original poster (OP) answered.
- **System-controlled identity markers.** An automatic "OP" tag, post and user flair whose options moderators control, and "Official" and admin labels.
- **Layered moderation.** Removal reasons (now AI-suggested), Crowd Control that collapses or filters untrusted users, LLM harassment and reputation filters, and score hiding for a set time.

Awards were shut down in 2023, replaced by a paid "Golden Upvote" pilot, and came back in May 2024 as awards bought with "gold". They are not available in sensitive communities.

### Cited Findings

#### Ranking math and sort orders
- Evan Miller's "How Not To Sort By Average Rating" (Feb 6, 2009; SQL added in 2012 and Excel in 2016) rejects two naive scores:
  - **Wrong #1, positive minus negative.** Urban Dictionary is the example. A 5,500/4,500 item (55% positive, score 1000) outranks a 600/400 item (60% positive, score 200).
  - **Wrong #2, the plain average.** Amazon is the example. A 2/0 item outranks a 100/1 item.
  — [Evan Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html)
- Miller's fix is the lower bound of the Wilson score interval for a Bernoulli parameter, which answers: "Given the ratings I have, there is a 95% chance that the 'real' fraction of positive ratings is at least what?" — [Evan Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html)
  - His implementation is `(phat + z*z/(2*n) - z*Math.sqrt((phat*(1-phat)+z*z/(4*n))/n))/(1+z*z/n)`, where p̂ is the share of positive ratings, n is the total number of ratings, and z = 1.96 for 95% confidence. The z value never changes, so it can be hard-coded.
  - The article covers only binary up/down ratings ("not a 5-star scale").
  - Miller says the method "has since caught on at places like Reddit, Yelp, and Digg."
- Reddit's blog post introducing the sort, "reddit's new comment sorting system," has the date 2009-10-15 in its original path (redditblog.com/2009/10/15/…), which now redirects to redditinc.com. I could not retrieve its text. — [Reddit blog (redirect target)](https://www.redditinc.com/blog/reddits-new-comment-sorting-system/)
- Reddit's archived open-source ranking code (`r2/lib/db/_sorts.pyx`) — [reddit-archive/_sorts.pyx](https://raw.githubusercontent.com/reddit-archive/reddit/master/r2/r2/lib/db/_sorts.pyx):
  - **Best (confidence).** The docstring cites Miller's article. The code sets `z = 1.281551565545 # 80% confidence`. Scores are precomputed in a table for ups < 400 and downs < 100 and computed directly above that. A comment with no votes scores 0.
  - **Top.** `score = ups - downs`.
  - **Controversial.** The score is 0 if either ups or downs is 0. Otherwise `magnitude = ups + downs`, `balance = min/max of ups/downs`, and the score is `magnitude ** balance`.
  - **Hot** (for posts). `seconds = date - 1134028003`, then `round(sign * order + seconds / 45000, 7)`.
  - **Q&A.** "Similar to the 'best' (confidence) sort, but specially designed for Q&A-type threads to highlight good question/answer pairs." It counts "Only… the 'best' answer from OP." The helper is `score_modifier + (length_modifier / 5)` with `length_modifier = log10(question_length + answer_length)`.
- "Old" sorts in posting order. One forum user says some people use it to "see things in the rough order they were posted." This is a weak source. — [LessWrong discussion](https://www.lesswrong.com/posts/NwbQFJ8n7rsQkpN8b/new-best-comment-sorting-system)

#### Score display and anti-bandwagon controls
- Reddit added "Minutes to hide comment scores" for moderators in 2013 to reduce the bias of seeing how others voted. Scores stay hidden for the set number of minutes, up to 1440 (24 hours). Moderators and admins still see the real scores, and voting continues normally. — [r/modnews 2013 (mirror)](https://axebps-redlib.hf.space/r/modnews/comments/1dd0xw/moderators_new_subreddit_feature_comment_scores); [itgeared](https://www.itgeared.com/why-are-scores-hidden-on-reddit/)
- Where the setting lives: "Other options" on old Reddit, and Mod tools → General Settings → Comment threads on new Reddit. This is an anecdotal user report. — [r/modhelp (mirror)](https://lr.in.psf.lt/r/modhelp/comments/1kc4v08/how_to_hide_votes)
- Communities argue about the length. A 2022 r/CryptoCurrencyMeta proposal to go from 5 to 60 minutes split the thread, and a 2023 poll was mixed. — [r/CryptoCurrencyMeta (mirror)](https://axebps-redlib.hf.space/r/CryptoCurrencyMeta/comments/s45e8f/preproposal_the_time_to_hide_comment_scores)

#### Nesting, "continue this thread," collapse
- Deep threads end in "Continue this thread" links that open the deeper replies on a separate page. A popular userscript exists only to load them inline. — [Greasy Fork userscript](https://greasyfork.org/scripts/5578-reddit-load-continue-this-thread-inline/discussions/53009)
- Reddit's comment tree also folds tails into "load more" stubs that list the hidden comment ids. Source is a third-party CLI guide. — [reddit-cli guide](https://reddit-cli.pages.dev/guides/comment-trees/)
- A counter-model is single-level nesting (Facebook-style). Jeff Kaufman (2015) changed his mind in its favor: "each top-level comment provides a topic and a jumping off point for a discussion with back-and-forth," and "one level of replies seems like a good fit." He concedes that "in a massive discussion you would still have a problem." — [Jeff Kaufman](https://jefftkaufman.substack.com/p/single-level-nesting)
- Crowd Control lets moderators collapse or filter comments, and since early 2022 posts too, from users not yet trusted in the community. The post's example is negative community karma. Filtered posts go to Modqueue and stay hidden until a moderator approves them. — [r/modnews 2022 (mirror)](https://lr.eu.psf.lt/r/modnews/comments/schw0n/crowd_control_now_supports_filtering_posts/huajjk4/?context=3)

#### Live thread features (Dec 2021)
- Reddit added real-time features on posts — [TechCrunch, Dec 1 2021](https://techcrunch.com/2021/12/01/reddit-introduces-new-real-time-features-including-typing-and-comment-indicators/); [Engadget](https://www.engadget.com/reddit-real-time-typing-indicators-160004276.html):
  - vote totals and comment counts that animate live;
  - a typing indicator that shows **how many** people are typing using **anonymous avatars, not usernames**;
  - a reading indicator when two or more users are reading the same post;
  - a new-comment indicator that, when clicked, sorts by New and highlights live comments.
- Reddit framed these as "aimed at increasing engagement." Its reasoning was that people who know others are viewing are more likely to contribute. — [TechCrunch](https://techcrunch.com/2021/12/01/reddit-introduces-new-real-time-features-including-typing-and-comment-indicators/)
- Reddit's own announcement was titled "Several people are typing…" (r/blog, Dec 17 2021). — [r/blog (mirror)](https://lr.in.psf.lt/r/blog/comments/ripui0/several_people_are_typing_updates_on_scrolling/hozfvq4/?context=3)

#### Identity markers: OP, flair, official labels
- Reddit automatically puts an "OP" tag next to the original poster's username when they comment in their own thread. — [SlashGear](https://www.slashgear.com/1837245/op-reddit-meaning/)
- Post flair tags a single submission. User flair sits beside a username and describes the person. Moderators set the options per community. — [Online Tech Tips](https://www.online-tech-tips.com/reddit-flair-spoiler-tags-formatting-guide/); [Redship glossary](https://redship.io/glossary/flair)
- Only the OP, moderators, and admins can change a post's flair, and the OP usually picks it. — [HustleGrow help article](https://hustlegrow.featurebase.app/en/help/articles/8041840-what-are-flairs-on-reddit-and-how-to-select-them)
- In July 2023 Reddit added an "Official" label to tell brand accounts from ordinary users. — [Social Samosa](https://www.socialsamosa.com/2023/07/reddits-new-label-distinguish-brands-from-users); [r/reddit changelog (mirror)](https://reddit.birdcat.cafe/r/reddit/comments/15aerd6/changelog_official_labels_notification_checks_and/jtkj5lr/?context=3)

#### Awards (2023 to 2024)
- Reddit shut down Coins and Awards in 2023 and replaced them with "Golden Upvotes" bought with cash. Its May 2024 post said that system "wasn't as expressive as awards." — [TechCrunch, May 16 2024](https://techcrunch.com/2024/05/16/reddit-reintroduces-its-awards-system); [r/reddit "We heard you, awards are back" (mirror)](https://lr.in.psf.lt/r/reddit/comments/1css0ws/we_heard_you_awards_are_back)
- How the May 2024 awards work — [TechCrunch](https://techcrunch.com/2024/05/16/reddit-reintroduces-its-awards-system); [r/modnews "Wrapping the Golden Upvote pilot" (mirror)](https://lr.in.psf.lt/r/modnews/comments/1css2xx/wrapping_the_golden_upvote_pilot_newish_and/l470b0f):
  - they are bought with "gold" and cost roughly 15 to 50 gold;
  - mobile packs range from $1.99 for 100 gold to $49.99 for 2,750 gold;
  - they are not available in NSFW, trauma and addiction support, or mature-content subreddits.
- A Reddit reply says gold you **earn** cannot be spent on awards and counts toward the Contributor Program instead. — [r/reddit thread (mirror)](https://lr.in.psf.lt/r/reddit/comments/1css0ws/we_heard_you_awards_are_back)

#### Moderation tooling
- **Harassment filter (March 2024).** An LLM-based tool that filters posts and comments likely to be harassing. — [The Register](https://www.theregister.com/2024/03/07/reddit_introduces_aipowered_harassment_filter/)
  - A later r/modnews update, which I saw only in a search summary and could not load, lets moderators send filtered items to a "Removed" queue or keep them in the main queues.
- **Modmail harassment filter (Feb 2023).** Moves likely-harassing messages to a "Filtered" folder. — [r/modnews (mirror)](https://lr.in.psf.lt/r/modnews/comments/10r2em3/the_modmail_harassment_filter_is_now_available_to)
- **Reputation filter (2024).** Filters content from "potentially inauthentic users, including potential spammers." An admin says it runs on an LLM trained on moderator actions and on content removed by Reddit's enforcement. — [r/ModSupport admin comment (mirror)](https://lr.eu.psf.lt/r/ModSupport/comments/1d8s9ae/moderation_resources_for_election_season/l7a4o5g/?context=3)
- **Removal reasons (March 2026).** Reddit added AI suggestions based on a community's existing reasons and on the content being removed. Moderators are divided on them. — [PiunikaWeb](https://piunikaweb.com/2026/03/12/reddit-new-mod-tools-post-guidance-onboarding/)
- **AutoModerator messages (2025).** These now arrive as inbox notifications, not private messages. — [r/reddit PM-to-chat announcement (mirror)](https://redlib.hbubli.cc/r/reddit/comments/1jf1bxy/private_messages_will_be_replaced_with_reddit)

#### Composer
- New Reddit's default editor is the "Fancy Pants" what-you-see-is-what-you-get (WYSIWYG) editor, with a "Switch to markdown" option. — [r/redesign 2018 staff post (mirror)](https://reddit.birdcat.cafe/r/redesign/comments/8nkr81/posting_on_new_redditan_update_about_drafts_post); [Markdown Guide](https://www.markdownguide.org/tools/reddit/)
  - According to a 2018 staff post, a cookie stores the editor mode, and text converts automatically when you switch.
  - Some features work only in markdown: superscript, tables, and some spoiler forms.
  - Old Reddit is markdown-only. This is 2018–2023 information and may be out of date.

### Inferences
Pattern catalog for the planned TasksNearMe community feed (posts and replies). This is my synthesis, not sourced fact.
- **"Best" replies with the Wilson lower bound.** My arithmetic from the formula above:
  - When every vote is positive, the bound reduces to **n/(n+z²)**. At z = 1.96, 2/0 scores 0.34 and 100/1 scores 0.95, so the well-supported reply wins. At Reddit's z = 1.28, 2/0 scores 0.55 and 100/1 scores 0.97.
  - Miller's 600/400 item scores 0.569 and his 5,500/4,500 item scores 0.540, so the ordering comes out right.
  - Caveat: a neighborhood feed may not want public downvotes, which can be used against a helper's livelihood. Without downvotes, Wilson needs a real denominator, such as positive = "Helpful" taps and n = unique readers who opened the reply. Otherwise use a time-decayed "helpful" count.
- **Reddit's other formulas, worked through.** Controversy (50/50 gives 100^1 = 100; 90/10 gives 100^0.11 ≈ 1.7) is fine for staff triage but probably not a user-facing sort. In Hot, 45,000 s = 12.5 h, so each 12.5 hours of age costs one "order" unit. Reddit's code computes order from the net score; the line I retrieved does not show exactly how.
- **Q&A sort.** For "Can anyone recommend…?" posts, Reddit's Q&A idea fits well: rank answers higher when the OP replied to them or marked them "This helped."
- **Score display.** Show nothing for the first N minutes, as with Reddit's hide-scores setting (max 24 h). After that, show only positive counts ("12 found this helpful"). Never show downvote totals.
- **Depth.** At phone width (360 px), use one reply level as Kaufman suggests, or at most 2–3 levels with a "Continue thread" route.
  - Each collapsed branch shows a reply count and a "+N more" stub.
  - Collapse by tapping a full-height thread line.
  - Auto-collapse replies from new or untrusted accounts, as Crowd Control does.
- **Identity labels.** Assign labels automatically; users can't edit them, which prevents impersonation.
  - "Poster", the OP equivalent.
  - "Verified helper" or category badges, a flair equivalent that is earned, not picked.
  - "TasksNearMe staff", like Reddit's Official and admin labels.
  - Free-text flair would invite fake "licensed" claims.
- **Awards.** Skip paid awards. Reddit shut them down, piloted a replacement, then brought them back in under a year, and keeps them out of sensitive communities. A free reaction or "Thanks" covers the social need.
- **Moderation.**
  - Report → case, which matches backlog item B-059 ([backlog](/home/ubuntu/TasksNearMe/docs/blueprint/11-initial-backlog.md)).
  - Removal-reason templates are sent to the author.
  - Filters (harassment, spam, reputation) route content to a "Filtered" review queue instead of deleting it silently.
  - Trust tiers drive collapse and filter rules.
- **Live thread cues.** "3 neighbors are reading" and "2 typing" use anonymous avatars and counts only. New replies appear behind a "New replies · Show" pill, not inserted into the list.

### Gaps
- I found no source for the exact depth at which "Continue this thread" appears on old or new Reddit, or how it differs on mobile.
- Not verified: Reddit's current collapse UI (thread-line tap targets, auto-collapse of low scores), and vote fuzzing.
- AutoModerator's rule syntax and capabilities were not researched. Only its 2025 move to inbox notifications is covered.
- I did not review the 2019 critique "A decade later, Reddit's comment sorting still fails to do its job" ([singlelunch](https://singlelunch.com/2019/09/17/a-decade-later-reddits-comment-sorting-still-fails-to-do-its-job/)) or Tildes' experiment against deep nesting ([Tildes](https://tildes.net/~tildes.official/cjg/experimenting_with_a_way_of_avoiding_deeply_nested_comment_threads)).
- I could not retrieve the 2009 Reddit blog text.
- Award changes after May 2024 were not checked.
- The comment composer's 2024–2026 state (drafts, mentions, media) is not verified.

## 2. Reddit Chat (2023–2026): direct messages (DMs) and chat channels, layout, reactions, replies, typing and read state, unread markers, message requests, blocking and reporting

### Takeaway
In 2025 Reddit folded private messages into Chat.
- **Timeline.** Announced March 19, 2025; due to finish by the end of July 2025.
- **What moved where.** Old private messages became a read-only archive with permalinks. Mod Mail stayed but reaches users as chat. Admin and AutoModerator messages became inbox notifications.
- **Safety.** It rests on **gating chat requests**:
  - options beyond everyone or nobody, plus an allowlist;
  - since May 2025, an "Additional Requests" folder for spammy requests;
  - admins and moderators can always get through.
- **Chat channels** (from April 2023) add threads through "reply," pinned messages, and typing indicators.
- **Typing indicators** moved to the conversation header on iOS in 2025 so the timeline stops jumping.

Whether DM read receipts exist today is supported only by third-party and 2020-era sources.

### Cited Findings
- On March 19, 2025, Reddit announced that private messages would be replaced by Reddit Chat and inbox notifications — [r/reddit announcement (mirror)](https://redlib.hbubli.cc/r/reddit/comments/1jf1bxy/private_messages_will_be_replaced_with_reddit):
  - the move was planned to finish by the end of July 2025;
  - old private messages stay as a read-only archive with unique permalinks;
  - all chat messages get permanent links;
  - admin messages that can't take replies become inbox notifications;
  - AutoModerator messages go to the inbox as notifications;
  - **admins are labeled in chat**;
  - Mod Mail stays the same, but its messages reach users as chat;
  - private-message API endpoints keep working for 99% of requests, with five rarely used endpoints removed;
  - old Reddit gets small UI updates.
- A Reddit help-center article later said the move was complete. I saw this only in a search summary; the page returned 403. — [Reddit Help: "Enhancing Messaging on Reddit"](https://support.reddithelp.com/hc/en-us/articles/34720093903764-Enhancing-Messaging-on-Reddit-A-simpler-faster-and-easier-way-to-communicate)
- Reaction to the announcement was mostly negative; commenters said chat "barely works" on old Reddit. One user reported that chat can be turned off in privacy settings (a user claim, not an official one). — [r/reddit thread (mirror)](https://redlib.hbubli.cc/r/reddit/comments/1jf1bxy/private_messages_will_be_replaced_with_reddit)
- The May 7, 2025 "Reddit chat update: more control, better tools" (search summary; the page would not load) — [r/modnews (mirror)](https://cal1.lr.ggtyler.dev/r/modnews/comments/1kh56nv/reddit_chat_update_more_control_better_tools); repeated in [r/redditchat, Oct 2025 (mirror)](https://r.datuan.dev/r/redditchat/):
  - settings go beyond "everyone" and "nobody," including a **chat allowlist** in privacy settings;
  - with a restricted setting, only approved people can send chat requests, except admins and moderators using Mod Mail;
  - an existing private-message allowlist carries over;
  - requests that look spammy or suspicious go to a separate **"Additional Requests"** folder;
  - requests from allowlisted users always land in the main inbox.
- In 2023, users said they could not report chat requests as spam, and that ignoring a request made the whole chat disappear with no way to report it. — [r/RedditSafety Q4 report thread (mirror)](https://pol1.lr.ggtyler.dev/r/RedditSafety/comments/11k7y7w/q4_safety_security_report)
- Community chat channels launched in 25 subreddits in April 2023 after a test. They stay in the community's navigation bar and were described as "mod-first," with moderator options including a mod-only channel. — [TechCrunch](https://techcrunch.com/?p=2535299); [Social Media Today](https://www.socialmediatoday.com/news/reddit-tests-new-community-chat-element-to-encourage-user-participation/648988)
- The November 2023 changelog covered chat channels — [r/reddit changelog (mirror)](https://lr.sudovanilla.org/r/reddit/comments/17ugpl6/changelog_comment_spotlights_new_chat_channels/k9tb6dz); [same thread (mirror)](https://lr.sudovanilla.org/r/reddit/comments/17ugpl6/changelog_comment_spotlights_new_chat_channels/k94ogh9/?context=3):
  - **threads**, or side conversations, start by choosing "reply" on a message, and others can see and join them;
  - **pinned messages**;
  - **typing indicators** ("visually see other redditors typing in the channel");
  - planned: user mentions with push notifications, and message editing by the sender.
- In May 2025 a Reddit staff member said threads were the focus for the next 3–6 months, "more reliable thread creation/badging – but also better replies." A user noted most people "just leave a separate message, and tag the person." — [r/redditchat "What's new in Reddit chat" (mirror)](https://reddit.zackpollard.pro/r/redditchat/comments/1kqkuc3/whats_new_in_reddit_chat)
- In April 2025 the iOS chat typing indicator moved to the top, under the username. An admin said this "prevents jumps in the timeline when users are reading chats and someone else is typing." Users complained. — [r/ModSupport (mirror)](https://redlib.hbubli.cc/r/ModSupport/comments/1kb2bho/updated_typing_indicator_placement_within_chat)
- Modmail got typing indicators on May 20, 2021. — [r/modnews (mirror)](https://lr.eu.psf.lt/r/modnews/comments/nhbce2/typing_indicators_for_modmail_go_live_today/gyzi6bg/?context=3)
- A third-party comparison says DM chat offers **read receipts, typing indicators, and custom-emoji reactions** for faster back-and-forth than the inbox. — [Postpone blog](https://www.postpone.app/blog/reddit-chat-vs-direct-messages)
- Older background:
  - **2020.** Reddit's chat ran on Sendbird, whose case study lists read receipts as a feature. — [Sendbird case study (2020)](https://get.sendbird.com/rs/047-LOL-803/images/20200519_reddit_case_study.pdf)
  - **2017–2018.** Reddit tested a chat beta in September 2017 and live chat rooms in 2018. — [r/beta 2017 (mirror)](https://lr.eu.psf.lt/r/beta/comments/72tyo5/today_were_testing_our_chat_beta); [Engadget 2018](https://engadget.com/2018/07/18/reddit-real-time-chat-beta)

### Inferences
- **No message-request inbox at launch.** The blueprint rules out "free public direct messages between strangers" ([product brief](/home/ubuntu/TasksNearMe/docs/blueprint/01-product-brief.md)). Messaging exists only on offers and bookings (B-030, [backlog](/home/ubuntu/TasksNearMe/docs/blueprint/11-initial-backlog.md)), so most of Reddit's request-gating problem doesn't arise. If the community feed later adds "message this neighbor," copy Reddit's 2025 model and fix its 2023 failure:
  - off by default, with options beyond everyone or nobody;
  - a requests folder plus a separate spam folder;
  - Report and Block available on the request itself, before accepting.
- **Typing indicator in the header.** Put "typing…" under the other person's name, not as a bubble in the list. That is Reddit's stated reason for the 2025 change: no timeline jumps.
- **Staff and system messages are labeled and not repliable.** Support and system notices should look clearly different, like Reddit's admin labels and inbox notifications, so a user can't pose as "TasksNearMe Support" in chat.
- **Every message has a permalink, and old threads become read-only.** This fits the blueprint's rule that messages stay on the platform for dispute evidence. Closed bookings' threads can become read-only archives, as Reddit did with old private messages.
- **Threads inside chat are hard.** Reddit is still working on reply and thread reliability two years in. For 1:1 booking chat, quote-reply (a quoted snippet above the new message) is enough, and nested threads aren't needed.

### Gaps
- I couldn't verify the current (2025–2026) layout of Reddit Chat: conversation list, thread pane, unread badges, the "new messages" divider, blocking flows, image rules, minor-safety limits. The help center returned 403 and mirror hosts were flaky.
- Whether DM read receipts are still on, and whether users can turn them off, rests only on third-party or 2020 sources.
- No primary source found for how chat-channel moderation works (slow mode, bans, word filters).

## 3. Professional chat conventions (Slack, Discord, Intercom, WhatsApp, marketplace chats such as Airbnb and Thumbtack): grouping, separators, unread dividers, presence, typing, delivery and read, quick replies, attachments, pinned context, search, mute and archive

### Takeaway
Mature chat products converge on a few patterns:
- **Message list structure.** Group consecutive messages by sender within a time window. Break groups at day separators. Show a persistent "N unread" divider plus a floating jump pill.
- **Presence and status.** Presence goes automatic (Slack: away after 10 minutes idle on desktop), but users can override it. Custom status can expire.
- **Read state and online status.** Read receipts and online status are **opt-out and reciprocal** (WhatsApp).
- **Response expectations.** Marketplaces replace live presence with **computed response expectations**: Airbnb's 24-hour response rate, Intercom's dynamic reply time, Thumbtack's one-hour, 8am–8pm metric. These come with sample-size fallbacks and business-hours windows.
- **Messaging tools.** Airbnb's 2024–2025 messaging adds reactions, threaded replies, templates with placeholders, scheduled sends, AI-suggested replies visible only to the host, edit within 15 minutes and unsend within 24 hours, and a unified inbox with search. Contact details stay hidden until a booking is confirmed.

### Cited Findings

#### Message list structure
- Stream's React chat software development kit (SDK) groups consecutive messages by user and time and tags each with a position class: `str-chat__li--top`, `--middle`, `--bottom`, or `--single`. Apps can customize grouping with a `groupStyles(message, previousMessage, nextMessage, noGroupByUser, maxTimeBetweenGroupedMessages?)` callback or turn it off. A date separator also ends a group, so each day starts fresh. — [Stream message list UI](https://getstream.io/chat/docs/sdk/react/ui/components/message-list-ui/); [Stream MessageList](https://getstream.io/chat/docs/sdk/react/components/core-components/message-list/); [stream-chat-react v13 types](https://unpkg.com/stream-chat-react@13.14.3/dist/components/MessageList/MessageList.d.ts)
- Stream's unread separator — [Stream message list UI](https://getstream.io/chat/docs/sdk/react/ui/components/message-list-ui/); [Stream virtualized list v12](https://getstream.io/chat/docs/sdk/react/v12/components/core-components/virtualized-list/):
  - it is a pill ("2 unread") with a close button, placed above the first unread message;
  - a floating copy appears at the top while the in-list one is scrolled out of view;
  - it **stays in place after the channel is marked read**, so the user still sees where the new messages start;
  - the virtualized list can add a date separator right before the first unread message, even within the same day.

#### Presence and status
- Slack's availability is automatic. "You're set to away after 10 minutes of desktop inactivity"; on mobile, you're away when you leave or close the app. — [Slack Help](https://slack.com/help/articles/201864558-Set-your-Slack-status-and-availability)
  - Users can set themselves active or away by hand.
  - A dot next to the name shows active or away.
  - Custom status is an emoji plus text with "Remove status after…" or "Clear after." Up to five statuses can be scheduled.
  - "Pause notifications" lasts until the status clears.
  - Automatic statuses cover huddles, focus mode, and after working hours ("Slack can let people know that you may be slow to respond based on your activity").
  - **Privacy note:** status "may be visible to members of other organizations in channels shared externally."
- Discord has four statuses: Online, Idle, Do Not Disturb, Invisible. Sources are secondary and disagree on the idle timeout (about 5 minutes vs about 10). — [How-To Geek](https://www.howtogeek.com/770109/what-does-idle-mean-in-discord/); [Unilink blog (2026)](https://unil.ink/blog/discord-status-meanings)
  - Only Online switches to Idle on its own.
  - Idle still gets notifications; Do Not Disturb does not.
  - Invisible shows you as offline, and custom status is hidden while Invisible.
- Discord users report that mobile can drop to invisible/offline after a few minutes of inactivity, not Idle. — [Discord support community](https://support.discord.com/hc/da/community/posts/360030154052-Let-mobile-discord-go-idle-instead-of-auto-invisible-offline?page=2)
- WhatsApp (secondary sources; I did not reach the official FAQ):
  - Settings → Privacy → **Last Seen and Online**; the Online control (2022) offers "Same as last seen" or "Nobody." — [itsourcecode](https://itsourcecode.com/blogs/how-to-hide-whatsapp-last-seen-2026/); [BestForAndroid](https://bestforandroid.com/hide-whatsapp-last-seen-android/)
  - Hiding your last seen also hides others' last seen from you (deliberate symmetry). — [BestForAndroid](https://bestforandroid.com/hide-whatsapp-last-seen-android/)
  - Turning off read receipts means you can't see others' read receipts either. — [InstantUsername](https://instantusername.com/blog/how-to-hide-your-online-status-on-whatsapp)
  - Read receipts are always sent in group chats. — [Staffordshire Live](https://www.staffordshire-live.co.uk/news/uk-world-news/hidden-mode-trick-whatsapp-makes-4277710)
  - The typing indicator is not covered by the Last Seen setting; people in a chat can still see you typing. — [Zee Business](https://zeebiz.com/technology/apps/news-whatsapp-tips-how-to-hide-your-online-status-step-by-step-guide-206061)

#### Expected-response indicators
- Intercom Messenger reply-time options are "In a few minutes," "In a few hours," "In a day," a custom number of hours, or **Dynamic**. — [Intercom: share your expected response time](https://www.intercom.com/help/en/articles/732436-share-your-expected-response-time); [Intercom: office hours](https://www.intercom.com/help/en/articles/732390-set-your-default-office-hours)
  - Dynamic is the team's median first reply time over the past 7 days, counted within office hours and only for new inbound conversations.
  - With fewer than 5 conversations in 7 days, it shows "replies as soon as they can."
  - Outside office hours, customers see when the team will be back online.
  - Reply expectations can be turned off.
- Airbnb measures two numbers — [Airbnb Help 430](https://www.airbnb.com/help/article/430):
  - **Response rate** is the share of new inquiries and reservation requests answered (accept, pre-approve, or decline) **within 24 hours over the past 30 days**. It affects Superhost status and **search placement**.
  - **Response time** is the average time to answer all new messages in the past 30 days. Follow-up messages don't count, and the host doesn't need to send the last message.
  - With fewer than 10 new threads in 30 days, both use the 10 most recent threads from the past 90 days.
  - Both appear at the bottom of each listing page.
- Airbnb's Superhost response rate is calculated differently, and its own pages disagree. The US page says it covers the past 365 days ([Airbnb Help 430 (US)](https://www.airbnb.com/help/article/430)). The Australian page says it uses the first reply to each new thread over 12 months, assessed quarterly ([Airbnb Help 430 (AU)](https://www.airbnb.com.au/help/article/430)).
- Thumbtack (community and third-party sources; treat details as unverified):
  - The profile shows a pro's average response time; one pro was told "the average pro in your area and category responds within 21 minutes." — [Thumbtack community](https://community.thumbtack.com/discussion/comment/2362)
  - The response-rate metric counts leads answered within one hour between 8am and 8pm local time. Pro Rewards thresholds are reported as 65% for Gold and 75% for Platinum. — [Thumbtack community: Response Time / Front Desk](https://community.thumbtack.com/discussion/1898/response-time-front-desk)
  - A 2025 Pro Summit recap, cited by a third-party blog, says pros who reply within 30 minutes are 25% more likely to be hired than those who reply within three hours. — [Thumbtack 2025 Pro Summit recap](https://www.thumbtack.com/guide/content/3-takeaways-from-the-2025-pro-summit)
  - Thumbtack's "Front Desk" concierge answers inquiries for pros in about 2 minutes (an average). — [Thumbtack press](https://press.thumbtack.com/announcements/thumbtack-announces-front-desk-a-first-of-its-kind-concierge-service-to-help-small-businesses-grow-more-sustainably)

#### Marketplace messaging features
- Airbnb's 2024 Summer Release added **emoji reactions**, **AI-suggested quick replies** for common questions, and one place for all guest, host, and support messages with **unified search**. — [Airbnb 2024 Summer Release](https://news.airbnb.com/product-releases/airbnb-2024-summer-release); [Airbnb host release page](https://www.airbnb.com/release/host/2024-summer)
- Some hosts complained about translation changes. — [Airbnb Community](https://community.withairbnb.com/t5/Airbnb-updates/Your-feedback-inspired-the-2024-Summer-Release/m-p/1935329)
- Airbnb's Translation Engine was expanded to Messages. — [Hospitality Net](https://www.hospitalitynet.org/news/4112343.html)
- Airbnb's messaging upgrades (Oct 16, 2024; updated Jul 30, 2025) — [Airbnb Resource Center](https://www.airbnb.com/resources/hosting-homes/a/communicate-more-efficiently-with-messaging-upgrades-696):
  - more than a dozen new quick-reply templates (directions, wifi, checkout) that hosts can edit, send, or **schedule**;
  - **placeholders** that fill in details such as the guest's name;
  - an **AI-suggested reply that only the host sees** and can edit;
  - a reminder before a scheduled message goes out, so the host can adjust or skip it;
  - **threaded replies**, where a reply nests under the original message;
  - **edit within 15 minutes, unsend within 24 hours**.
- Before booking, Airbnb automatically hides phone numbers, email addresses, and outside links in messages. Asking to move off-platform can lead to account restrictions. Sources are third-party, and some hosts say numbers stay hidden even after confirmation. — [STR Specialist](https://strspecialist.com/how-to-send-number-on-airbnb); [Autohost docs](https://docs.autohost.ai/docs/knowledge/best-practices/booking-channels-ota/abiding-by-airbnbs-off-platform-policy); [Smoobu](https://www.smoobu.com/en/blog/airbnbs-off-platform-policy-explained/)

### Inferences
How each pattern would work in a TasksNearMe booking or offer thread. The blueprint already plans threads, attachments, real-time delivery, contact masking, quick status buttons, unread counts, and flagging ([product brief](/home/ubuntu/TasksNearMe/docs/blueprint/01-product-brief.md); B-030 and B-037 in the [backlog](/home/ubuntu/TasksNearMe/docs/blueprint/11-initial-backlog.md)).

**Message grouping**
- How: consecutive messages from one sender within a few minutes form a group, with the avatar and name on the first and the time on the last. A gap, a sender change, or a day separator ends the group.
- What it shows: day separators read "Today," "Yesterday," or "Tue, Nov 11" in America/Chicago, using `@/shared/format`.
- Safeguards: none needed.

**Unread divider**
- How: an "N new" pill sits above the first unread message and stays until the thread is closed. A floating "Jump to new" pill appears when it scrolls out of view.
- Safeguards: unread counts come only from the server, per participant.

**Pinned context card**
- What it shows: the offer or booking (status, time window, price, approximate area) at the top of the thread on mobile and beside it on desktop. The exact address appears only after confirmation, in the existing `ExactAddressPanel`.
- Safeguards: the card is role-projected, so the poster and helper see different money lines.

**Quick replies and templates**
- How: one-tap "On my way," "Running late," and "Arrived" (B-037), plus saved templates with placeholders ({client first name}, {date}). Optionally, scheduled messages with a reminder before they send (Airbnb).
- Safeguards: templates go through the same contact masking as typed text.

**Edit and unsend windows**
- How: edit within 15 minutes, with a visible "edited" marker. Unsend within a short window.
- Safeguards: **support keeps the original text** for disputes and chargeback evidence (B-044), so unsend hides the message from the other party but not from the audit record.

**Reactions and quote-reply**
- How: reactions cut down on "ok thanks" messages. Quote-reply is enough for 1:1 chat.
- Safeguards: rate-limit reactions, and accept them only from thread participants (see the Careless Whisper finding in section 4).

**Delivery and read state**
- What it shows: "Sent → Delivered → Seen," inside booking threads only.
- Safeguards: a reciprocal opt-out like WhatsApp's (turn off Seen and you don't see others'). No receipts or typing events reach anyone who isn't an active participant, or anyone who is blocked.

**Presence**
- How: avoid "online now" and "last seen" for helpers anywhere public. In a local-services app, presence can show when someone is home, busy, or away.
- What it shows instead: Airbnb- and Intercom-style computed promises ("Usually replies within an hour"). The profile spec already lists response time ([product brief](/home/ubuntu/TasksNearMe/docs/blueprint/01-product-brief.md)).
- Safeguards: if live presence is ever added, scope it to an active booking's participants, keep it coarse ("Active now" or nothing), and let users opt out.

**Response-time badge rules**
- How:
  - count only the first reply to new threads (Airbnb ignores follow-ups);
  - measure within business hours (Thumbtack 8am–8pm, Intercom office hours) in the market's time zone;
  - fall back on small samples (Airbnb: last 10 threads in 90 days; Intercom: fewer than 5 in 7 days → "replies as soon as they can");
  - show buckets, not exact minutes ("within an hour," "within a few hours," "within a day").
- Safeguards: hide the badge entirely below a minimum sample. Don't let auto-replies count, which is the open question with Thumbtack's Front Desk.

**Search, mute, and archive**
- How: one inbox across roles (as a poster and as a helper), like Airbnb's unified inbox, with search and filters for unread, active booking, and archived.
- Safeguards: mute never mutes safety or system messages.

### Gaps
- No primary source reached for:
  - Slack's "New messages" divider, mark-as-unread, and keyboard shortcuts;
  - Discord's message grouping rules and timing;
  - Upwork Messages (read receipts, off-platform policy, file limits);
  - WhatsApp's official FAQ (all WhatsApp facts above come from secondary sources).
- Not verified: Airbnb's in-thread reservation panel layout, and its attachment types and size limits.
- No reputable UX study (for example Nielsen Norman Group) on chat grouping or separators was found in this pass.

## 4. Live-activity mechanics (real-time feeds, live counters, "X people viewing", response-time badges, online-now), how they are built (WebSockets, SSE, pub/sub such as Ably, Postgres LISTEN/NOTIFY), and their privacy implications

### Takeaway
"Live" feel comes from four kinds of cues:
- **Ambient, anonymous aggregate cues.** Reddit's live counts, anonymous "N typing," "2+ reading," and a new-comments prompt.
- **Computed promises.** Response-time badges.
- **Scoped presence.** Presence shown only inside a channel.
- **Fake activity, which is the risk.** A Princeton crawl found deceptive "currently viewing" counters made with random number generators, and journalists documented a site showing 28–45 random "people looking."

Technically:
- **SSE** (server-sent events) is one-way, reconnects on its own, and is limited to 6 connections per browser and domain on HTTP/1.1.
- **WebSockets** are two-way but have no backpressure.
- **Postgres NOTIFY** delivers only on commit, carries under 8,000 bytes, and is not a durable queue.
- **Ably presence** keeps a member present 15 seconds after a drop, caps channels at 200 members by default, and bills every presence event.

Privacy-wise, presence and receipts leak more than they seem to: the 2024–2025 "Careless Whisper" research shows silent delivery receipts reveal device activity to strangers on WhatsApp and Signal.

### Cited Findings

#### What live sites show
- Reddit's 2021 live features were live vote and comment counts, an anonymous typing count, a "2+ reading" indicator, and a new-comment prompt that re-sorts by New. Reddit's stated aim was more engagement. — [TechCrunch](https://techcrunch.com/2021/12/01/reddit-introduces-new-real-time-features-including-typing-and-comment-indicators/)
- Response-time badges in practice (Airbnb, Intercom, Thumbtack) are covered in section 3. — [Airbnb Help 430](https://www.airbnb.com/help/article/430); [Intercom](https://www.intercom.com/help/en/articles/732436-share-your-expected-response-time)

#### Fake activity and dark patterns
- The Princeton "Dark Patterns at Scale" crawl of about 11,000 shopping sites (2019) counts "activity notifications" as a dark-pattern category. — [arXiv 1907.07032](https://arxiv.org/pdf/1907.07032); [Princeton WebTAP](https://webtransparency.cs.princeton.edu/dark-patterns)
  - It recorded 313 activity-notification instances. According to my search summary, 29 instances on 20 sites were deceptive, mostly random or hard-coded numbers such as a random number generator for users "currently viewing." Check this against the paper's tables.
  - The authors call these notifications "partially covert and sometimes deceptive."
- The BBC (Dec 2019) reported that OneTravel showed "38 people are looking at this flight" from code that picked a number between 28 and 45. — [BBC Worklife (mirror)](https://bbcbreakingnews.pages.dev/worklife/article/20191211-the-fantasy-numbers-that-make-you-buy-things-online); [Deceptive Design](https://deceptive.design/articles/how-dark-patterns-influence-travel-bookings)
- ThredUp told the New York Times that its notices used "real data," but didn't say whether they reflected real recent purchases. — [NYT via BusinessWorld](https://www.bworldonline.com/?p=238503); [Deceptive Design: ThredUp](https://deceptive.design/articles/thredupcom-activity-notification)

#### Transport: SSE, WebSockets, Postgres LISTEN/NOTIFY, Ably presence
- **SSE (MDN)** — [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events):
  - `EventSource` opens a **one-way** server-to-client stream ("you can't send events from a client to a server");
  - the server responds with `text/event-stream` in UTF-8, each event a block of `event:`, `data:`, `id:`, `retry:` lines ended by a blank line;
  - the `id` field sets the last event ID, and the connection restarts automatically if it closes;
  - lines starting with `:` are comments and can be sent periodically as keep-alives;
  - on HTTP/1.x the browser allows only **6 connections per browser and domain** (Chrome and Firefox call this "Won't fix"); on HTTP/2 the stream limit is negotiated, 100 by default.
- **WebSockets (MDN)** give a "two-way interactive communication session." The `WebSocket` interface "doesn't support backpressure": fast incoming messages can fill memory or pin the CPU. MDN suggests WebTransport when backpressure matters, and calls `WebSocketStream` non-standard. — [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- **Postgres NOTIFY** — [PostgreSQL docs: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html):
  - the payload must be under 8,000 bytes by default ("put it in a database table and send the key of the record");
  - events are delivered **only if and when the transaction commits**, and only between the listener's transactions ("keep their transactions short");
  - identical payloads on one channel within one transaction are merged into one event;
  - events arrive in send order within a transaction and in commit order across transactions;
  - the queue holds 8 GB in a standard install, and if it fills, `NOTIFY` transactions fail at commit; a session that LISTENs and then sits in a long transaction blocks cleanup;
  - a common pattern is a statement trigger that sends `NOTIFY` on table updates;
  - a session can skip its own notifications by comparing the sender's process ID with its own.
- The NOTIFY page **does not explicitly say** that disconnected listeners lose notifications. It implies it, since delivery goes only to sessions currently listening. — [PostgreSQL docs: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
- **Ably presence** — [Ably docs: Presence](https://ably.com/docs/presence-occupancy/presence):
  - members are identified by `clientId` plus `connectionId`, so the same user on phone and desktop counts twice;
  - events are enter, leave, update, and present, and joining or reading presence needs `presence` and `presence-subscribe` capabilities;
  - after an abrupt drop, a member stays present **15 seconds** (down to 1 second with `remainPresentFor`); detecting the drop can take up to 30 seconds, and membership survives brief disconnects of up to 2 minutes;
  - presence history is kept 24 or 72 hours with persistence, otherwise only the last 2 minutes in memory;
  - channels default to **200 presence members**, or up to 20,000 with server-side batching;
  - **every presence event is a billable message**: 200 clients joining and leaving produce 80,400 messages;
  - "occupancy" gives "high level metrics about the clients attached to a channel" (counts) rather than member identities.

#### Privacy and security of presence, typing, and receipts
- "Careless Whisper" (Gegenhuber et al.; arXiv 2024, RAID 2025) — [arXiv 2411.11194](https://arxiv.org/pdf/2411.11194); [SBA Research PDF](https://publications.sba-research.org/publications/RAID_2025_Careless_Whisper_Exploiting_Silent__Gabriel%20Gegenhuber.pdf):
  - delivery receipts can't be turned off, and their timing reveals when a target's screen is on or off;
  - receipts can be triggered **silently, without notifying the target**;
  - on WhatsApp and Signal the attacker needs **no relationship** with the target;
  - activity can be followed across a person's devices, and differences between implementations reveal the target's OS and app client.
- A public proof of concept sends reactions to invalid message ids and times the receipts. Reporting in 2025 said neither Meta nor Signal had patched this at the protocol level. WhatsApp's "Block unknown messages" (Settings → Privacy → Advanced) is the main user-side step. — [CyberInsider](https://cyberinsider.com/tool-allows-stealthy-tracking-of-signal-and-whatsapp-users-through-delivery-receipts/)
- Signal's behavior toward strangers is disputed: a community post claims Signal sends no receipts for "spooky strangers." This is anecdotal. — [Privacy Guides forum](https://discuss.privacyguides.net/t/daniel-boctor-apps-refuse-to-patch-design-flaw-that-tracks-everything-you-do/33126)
- Other presence controls already covered:
  - Reddit's typing indicator uses anonymous avatars, not usernames. — [TechCrunch](https://techcrunch.com/2021/12/01/reddit-introduces-new-real-time-features-including-typing-and-comment-indicators/)
  - Slack status can reach other organizations through shared channels. — [Slack Help](https://slack.com/help/articles/201864558-Set-your-Slack-status-and-availability)
  - WhatsApp's online and last-seen controls are reciprocal. — [BestForAndroid](https://bestforandroid.com/hide-whatsapp-last-seen-android/)

### Inferences
**Live patterns for TasksNearMe**

**"New tasks near you" feed**
- How: a live event adds to a counter, and a "3 new tasks · Show" pill appears without moving the list. Tapping it inserts the tasks at the top.
- What it shows: the category, neighborhood-level area, time window, and budget band. It never shows an exact address (contract privacy rule).
- Safeguards: delay public broadcast by a minute or two and round locations to neighborhoods, so a live feed can't be used to track a specific household.

**Live counters**
- What it shows: offers received and replies in a thread, always **real numbers from the database**.
- Safeguards: none of Princeton's or OneTravel's random or hard-coded counts. Show "X people viewing this task" only to the poster, only as an actual count, only above a threshold (for example 3 or more), and rounded. Don't show it on helper profiles, where "who's looking at me" is a stalking risk. A viewer count is a pressure tactic either way, so a static "5 helpers viewed today" summary is the gentler choice.

**Typing and reading cues**
- How: in 1:1 booking threads, show "typing…" in the header. In community threads, show only anonymous counts ("2 neighbors typing"), as Reddit does.
- Safeguards: throttle typing events, for example at most one every 3 seconds per user, and send them only to authorized channel members.

**Response-time badge instead of an online dot**
- How: a computed and bucketed promise (section 3) is the main "this site is alive" signal on profiles and search results. It is also a ranking input, as Airbnb uses response rate in search placement.
- Safeguards: helpers aren't penalized for nights outside their set hours.

**Delivery and read receipts**
- Safeguards: emit them only for messages between current participants of an offer or booking thread. Drop reactions and receipts from non-participants and blocked users. Rate-limit reactions.

**Transport for the stack**
The blueprint already chooses Ably with a token endpoint and per-user channels (B-030, "messages arrive in < 2 s"; [backlog](/home/ubuntu/TasksNearMe/docs/blueprint/11-initial-backlog.md)).
- How a message travels:
  1. The domain write commits.
  2. An outbox or `NOTIFY` row carries **only IDs**, which fits the 8,000-byte limit and commit-only delivery.
  3. The fan-out worker publishes "thread X changed" to each participant's Ably user channel.
  4. The client refetches the role-projected view through the normal query or server action, so the per-role money and address rules stay on the server.
- Why: NOTIFY and SSE aren't durable, so clients must **resync from the database** on reconnect, using the last seen event or message id.
- SSE as a fallback or alternative: needs HTTP/2 end to end to avoid the 6-connection limit across tabs. Not verified here for the project's Caddy and Next.js 16 setup.

**Presence budget**
- Use Ably presence only inside booking channels, which have 2–3 members. Never use it site-wide: every enter or leave is billable, the default cap is 200 members per channel, and a drop lingers about 15 seconds.
- For "N reading" on community posts, use occupancy-style counts with no member identities.

**Privacy defaults**
- No public online status or last seen.
- Receipts are on by default only inside bookings and can be turned off reciprocally.
- Presence and receipts stop the moment either side blocks or a booking closes.
- Document all of this in the privacy notice, since activity data reveals home and away patterns.

### Gaps
- Not researched in this pass:
  - regulatory guidance on fake activity and urgency cues (the FTC's 2022 dark-patterns report, the UK CMA's Booking.com pressure-selling commitments, EU rules);
  - other pub/sub options (Supabase Realtime, Pusher, Redis);
  - how Next.js 16 route handlers support SSE streaming;
  - whether the project's Caddy proxy serves HTTP/2 to browsers.
- Check the Princeton paper's per-category deceptive counts against its tables. My figure (29 deceptive of 313) comes from a search summary.
- The `Last-Event-ID` resume header is defined in the HTML Standard; MDN's page didn't spell it out, and I didn't verify it.
- I couldn't load reporting from 2025 that Reddit lets users hide profile post and comment history, and that moderators pushed back ([IBTimes headline](https://www.ibtimes.co.uk/reddits-latest-privacy-update-lets-users-go-darkmoderators-push-back-1735027)). It is relevant to activity-tracking privacy but unverified.
