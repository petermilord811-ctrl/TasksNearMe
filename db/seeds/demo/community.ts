import type { CategorySlug } from '../../../src/contracts/common';
import type { DemoPlan } from './plan';
import { createRng, type Rng } from './rng';

/**
 * The demo community (completion plan 7.11): in every demo market, neighbors asking who to hire, answering with
 * helpers they booked (and helpers offering themselves, marked as such), questions with answers, tips, and thanks
 * for finished bookings, with Thanks and Helpful from other people there. Built from the demo plan, so every
 * recommendation and thanks points at a real completed demo booking. Ids start with `cpo_demo_` / `cre_demo_`.
 */

export interface DemoCommunityPost {
  id: string;
  marketId: string;
  areaId: string | null;
  authorUserId: string;
  kind: 'recommendation' | 'question' | 'tip' | 'thanks';
  categorySlug: CategorySlug | null;
  helperUserId: string | null;
  bookingId: string | null;
  title: string;
  body: string;
  pinnedReplyId: string | null;
  replyCount: number;
  thanksCount: number;
  helpfulCount: number;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface DemoCommunityReply {
  id: string;
  postId: string;
  authorUserId: string;
  body: string;
  recommendedHelperUserId: string | null;
  thanksCount: number;
  helpfulCount: number;
  createdAt: Date;
}

export interface DemoCommunityReaction {
  targetKind: 'post' | 'reply';
  targetId: string;
  userId: string;
  kind: 'thanks' | 'helpful';
  createdAt: Date;
}

export interface DemoCommunity {
  posts: DemoCommunityPost[];
  replies: DemoCommunityReply[];
  reactions: DemoCommunityReaction[];
}

const THINGS: Record<CategorySlug, readonly string[]> = {
  'furniture-assembly': ['a flat-pack dresser', 'a queen bed frame', 'a standing desk', 'a tall bookshelf that needs anchoring', 'a crib and a changing table'],
  'moving-help': ['loading a rental truck', 'moving a couch up two flights', 'unloading a storage unit', 'moving a washer and dryer'],
  'yard-cleanup': ['a big leaf cleanup', 'weeding the front beds', 'hauling away yard debris', 'trimming overgrown shrubs'],
  'light-cleaning': ['a move-out clean', 'a tidy-up before guests arrive', 'a kitchen and bathroom deep clean'],
  'computer-help': ['setting up a new laptop', 'fixing slow Wi-Fi upstairs', 'moving photos off an old phone', 'setting up a printer'],
};

const REQUEST_BODIES = [
  'Looking for someone careful and on time. Weekend mornings work best for us. Who have you booked and would book again?',
  'We just moved in and have a long list. Would love a name from someone who has actually hired them.',
  'Tried doing it myself and gave up. Who do you trust with this around here?',
  'Not in a rush, but would like it done this month. Any names you can vouch for?',
];

const PRAISE = [
  'showed up right on time and left the place cleaner than they found it.',
  'was careful with our floors and walls, and explained everything as they went.',
  'finished faster than quoted and charged exactly what we agreed.',
  'was patient with all my questions and did a really tidy job.',
];

const SELF_TAGS = [
  'This is most of what I do on weekends. Happy to take a look; you can see my reviews on my profile.',
  'I can help with this. I bring my own tools and can usually come within a few days.',
];

const QUESTIONS: { title: string; body: string; category: CategorySlug | null; answers: string[] }[] = [
  { title: 'Does curbside pickup still take bagged leaves this month?', body: 'Our trees dropped everything at once. Is yard waste pickup still weekly, or should I book a haul-away?', category: 'yard-cleanup', answers: ['Still weekly on your trash day here. Paper lawn bags only, and keep them light.', 'If you have more than ten bags, a haul-away is usually quicker than waiting two pickups.'] },
  { title: 'How long does a flat-pack wardrobe really take?', body: 'The box says two hours. Be honest: how long did yours take, and is it a two-person job?', category: 'furniture-assembly', answers: ['Ours took closer to four hours with two people. The doors are the fiddly part.', 'Book someone for three hours and you will be fine. Ask them to anchor it to the wall too.'] },
  { title: 'What should I have ready before movers arrive?', body: 'First time hiring help to load a truck. What makes it go faster?', category: 'moving-help', answers: ['Label every box by room and keep a clear path from the door to the truck.', 'Have the truck parked close and the ramp down before they arrive; you pay for their time.'] },
  { title: 'Is it worth paying for help setting up a new laptop?', body: 'Mostly moving photos and email from my old one. Can I do it myself or is it a rabbit hole?', category: 'computer-help', answers: ['The photo move is the slow part. Having someone do it in one go saved me an evening.', 'If your old laptop still works, it is easy. If it does not, get help.'] },
];

const TIPS: { title: string; body: string; category: CategorySlug | null }[] = [
  { title: 'Count the hardware bags before assembly starts', body: 'Our dresser was missing a cam lock. The store mailed one free, but we lost a day. Count the bags against the manual first.', category: 'furniture-assembly' },
  { title: 'Rent the dolly when you book the truck', body: 'The rental place runs out of furniture dollies by Saturday morning. Add one when you reserve the truck online and your helpers will thank you.', category: 'moving-help' },
  { title: 'Photograph the cables before you unplug anything', body: 'Before a computer or TV move, take a quick photo of the back. Setting it up again takes minutes instead of an hour.', category: 'computer-help' },
  { title: 'Lay a towel down before assembling on hardwood', body: 'Panels slide and scratch. An old towel under the work area saves your floors, and the small parts stop rolling away.', category: 'furniture-assembly' },
];

const THANKS_BODIES = [
  'Booked them for {task} and it went perfectly. On time, careful, and they cleaned up after. Would book again in a heartbeat.',
  'Huge thanks for {task}. Friendly, fast, and exactly the price we agreed on. Recommending to everyone on our street.',
  'Just want to say thank you for {task}. Took the stress right out of our week.',
];

const firstNameOf = (plan: DemoPlan, userId: string) => plan.people.find((person) => person.id === userId)?.firstName ?? 'them';

/** The community for each demo market, from the plan's people, neighborhoods and finished bookings. */
export function buildDemoCommunity(plan: DemoPlan, now: Date): DemoCommunity {
  const rng: Rng = createRng(7_007);
  const out: DemoCommunity = { posts: [], replies: [], reactions: [] };
  const tasksById = new Map(plan.tasks.map((task) => [task.id, task]));
  const helperArea = new Map(plan.people.filter((person) => person.helper).map((person) => [person.id, person.helper!.areaId]));
  const markets = [...new Set(plan.clients.map((client) => client.marketId))];
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  for (const marketId of markets) {
    const key = marketId.replace(/^mkt_(demo_)?/, '');
    const clients = plan.clients.filter((client) => client.marketId === marketId);
    const helpers = plan.people.filter((person) => person.helper && (person.homeMarketId ?? 'mkt_austin') === marketId).map((person) => person.id);
    const completed = plan.bookings.filter((booking) => booking.marketId === marketId && booking.status === 'completed');
    const everyone = [...clients.map((client) => client.userId), ...helpers];
    if (clients.length < 3) continue;
    let n = 0;
    const postId = () => `cpo_demo_${key}_${String(++n).padStart(3, '0')}`;
    let r = 0;
    const replyId = () => `cre_demo_${key}_${String(++r).padStart(4, '0')}`;

    const react = (targetKind: 'post' | 'reply', targetId: string, authorId: string, at: Date, most: number) => {
      const people = rng.shuffle(everyone.filter((id) => id !== authorId)).slice(0, rng.int(0, most));
      let thanks = 0;
      let helpful = 0;
      for (const userId of people) {
        const kind = rng.chance(0.6) ? 'helpful' : 'thanks';
        out.reactions.push({ targetKind, targetId, userId, kind, createdAt: new Date(at.getTime() + rng.int(5, 600) * 60_000) });
        if (kind === 'helpful') helpful += 1;
        else thanks += 1;
      }
      return { thanks, helpful };
    };

    const addPost = (post: Omit<DemoCommunityPost, 'id' | 'pinnedReplyId' | 'replyCount' | 'thanksCount' | 'helpfulCount' | 'lastActivityAt'>, answers: { authorUserId: string; body: string; recommendedHelperUserId: string | null }[], pinFirst: boolean) => {
      const id = postId();
      const counts = react('post', id, post.authorUserId, post.createdAt, 7);
      let last = post.createdAt;
      const replies = answers.map((answer, index) => {
        const createdAt = new Date(post.createdAt.getTime() + (index + 1) * rng.int(20, 300) * 60_000);
        if (createdAt > last) last = createdAt;
        const id_ = replyId();
        const replyCounts = react('reply', id_, answer.authorUserId, createdAt, 4);
        return { id: id_, postId: id, authorUserId: answer.authorUserId, body: answer.body, recommendedHelperUserId: answer.recommendedHelperUserId, thanksCount: replyCounts.thanks, helpfulCount: replyCounts.helpful, createdAt };
      });
      const lastActivityAt = last > now ? now : last;
      out.posts.push({ ...post, id, pinnedReplyId: pinFirst && replies[0] ? replies[0].id : null, replyCount: replies.length, thanksCount: counts.thanks, helpfulCount: counts.helpful, lastActivityAt });
      out.replies.push(...replies.map((reply) => (reply.createdAt > now ? { ...reply, createdAt: now } : reply)));
    };

    // Recommendation requests, answered by neighbors who booked someone, and by helpers offering themselves.
    for (const booking of rng.shuffle(completed).slice(0, Math.min(3, completed.length))) {
      const task = tasksById.get(booking.taskId);
      if (!task) continue;
      const asker = rng.pick(clients.filter((client) => client.userId !== booking.posterUserId));
      if (!asker) continue;
      const category = task.categorySlug;
      const answers: { authorUserId: string; body: string; recommendedHelperUserId: string | null }[] = [
        { authorUserId: booking.posterUserId, body: `We booked ${firstNameOf(plan, booking.helperUserId)} for “${task.title}”. They ${rng.pick(PRAISE)}`, recommendedHelperUserId: booking.helperUserId },
      ];
      const selfTagger = rng.pick(helpers.filter((id) => id !== booking.helperUserId).concat([booking.helperUserId]));
      if (selfTagger && selfTagger !== booking.helperUserId && rng.chance(0.6)) answers.push({ authorUserId: selfTagger, body: rng.pick(SELF_TAGS), recommendedHelperUserId: selfTagger });
      addPost(
        { marketId, areaId: asker.areaId, authorUserId: asker.userId, kind: 'recommendation', categorySlug: category, helperUserId: null, bookingId: null, title: `Who do you recommend for ${rng.pick(THINGS[category])}?`, body: rng.pick(REQUEST_BODIES), createdAt: hoursAgo(rng.int(3, 220)) },
        answers,
        rng.chance(0.55),
      );
    }

    // Questions, answered by neighbors and helpers.
    for (const question of rng.shuffle(QUESTIONS).slice(0, 2)) {
      const asker = rng.pick(clients);
      const answerers = rng.shuffle(everyone.filter((id) => id !== asker.userId)).slice(0, question.answers.length);
      addPost(
        { marketId, areaId: asker.areaId, authorUserId: asker.userId, kind: 'question', categorySlug: question.category, helperUserId: null, bookingId: null, title: question.title, body: question.body, createdAt: hoursAgo(rng.int(2, 200)) },
        question.answers.slice(0, answerers.length).map((body, index) => ({ authorUserId: answerers[index]!, body, recommendedHelperUserId: null })),
        rng.chance(0.4),
      );
    }

    // A tip from someone who knows (a helper, or a neighbor), for the whole market.
    const tip = rng.pick(TIPS);
    const tipper = helpers.length > 0 && rng.chance(0.6) ? rng.pick(helpers) : rng.pick(clients).userId;
    addPost({ marketId, areaId: null, authorUserId: tipper, kind: 'tip', categorySlug: tip.category, helperUserId: null, bookingId: null, title: tip.title, body: tip.body, createdAt: hoursAgo(rng.int(6, 240)) }, [], false);

    // Thanks for finished bookings, answered by the helper.
    for (const booking of completed.slice(-2)) {
      const task = tasksById.get(booking.taskId);
      if (!task || out.posts.some((post) => post.bookingId === booking.id)) continue;
      const client = clients.find((candidate) => candidate.userId === booking.posterUserId);
      const at = booking.completedAt ? new Date(Math.min(now.getTime(), booking.completedAt.getTime() + rng.int(2, 30) * 3_600_000)) : hoursAgo(rng.int(12, 200));
      addPost(
        { marketId, areaId: client?.areaId ?? helperArea.get(booking.helperUserId) ?? null, authorUserId: booking.posterUserId, kind: 'thanks', categorySlug: task.categorySlug, helperUserId: booking.helperUserId, bookingId: booking.id, title: `Thank you, ${firstNameOf(plan, booking.helperUserId)}!`, body: rng.pick(THANKS_BODIES).replace('{task}', `“${task.title}”`), createdAt: at },
        [{ authorUserId: booking.helperUserId, body: `Thank you, ${firstNameOf(plan, booking.posterUserId)}! It was a pleasure.`, recommendedHelperUserId: null }],
        false,
      );
    }
  }
  return out;
}

export interface DemoTaskQuestion {
  id: string;
  taskId: string;
  askerUserId: string;
  body: string;
  answerBody: string | null;
  answeredAt: Date | null;
  pinned: boolean;
  createdAt: Date;
}

const QUESTIONS_BY_CATEGORY: Record<CategorySlug, readonly (readonly [string, string])[]> = {
  'furniture-assembly': [
    ['Do you have all the hardware, or is anything missing from the box?', 'Everything is in the box. I counted the bags against the manual.'],
    ['Is it going on carpet or a hard floor?', 'Hard floor, and there is room to lay all the pieces out.'],
    ['Does it need to be anchored to the wall?', 'Yes please, the anchor kit came with it. The wall is drywall.'],
  ],
  'moving-help': [
    ['Is there an elevator, or stairs only?', 'Stairs only, second floor. Nothing weighs more than about 80 pounds.'],
    ['Will the truck be parked close to the door?', 'Right in front of the building, with the ramp down.'],
  ],
  'yard-cleanup': [
    ['Do you have bags and a rake, or should I bring them?', 'I have paper bags. Please bring a rake.'],
    ['Where should the bags go when it is done?', 'By the curb on the left side of the driveway.'],
  ],
  'light-cleaning': [
    ['Do you have supplies, or should I bring mine?', 'Supplies are under the kitchen sink, including a mop.'],
    ['Any pets at home?', 'One friendly cat who mostly stays upstairs.'],
  ],
  'computer-help': [
    ['Is it Windows or a Mac?', 'Windows 11, about a year old.'],
    ['Do you still have the password for the old device?', 'Yes, I have it written down.'],
  ],
};

/** Questions on open demo tasks (completion plan 7.11): asked by demo helpers in the market, mostly answered. */
export function buildDemoQuestions(plan: DemoPlan, now: Date): DemoTaskQuestion[] {
  const rng: Rng = createRng(9_009);
  const out: DemoTaskQuestion[] = [];
  const markets = [...new Set(plan.tasks.map((task) => task.marketId))];
  for (const marketId of markets) {
    const key = marketId.replace(/^mkt_(demo_)?/, '');
    const helpers = plan.people.filter((person) => person.helper && (person.homeMarketId ?? 'mkt_austin') === marketId).map((person) => person.id);
    const open = plan.tasks.filter((task) => task.marketId === marketId && task.status === 'open' && task.windowEnd > now);
    if (helpers.length === 0 || open.length === 0) continue;
    let n = 0;
    for (const task of rng.shuffle(open).slice(0, Math.min(3, open.length))) {
      const pairs = rng.shuffle(QUESTIONS_BY_CATEGORY[task.categorySlug]).slice(0, rng.int(1, 2));
      const askers = rng.shuffle(helpers.filter((id) => id !== task.posterUserId)).slice(0, pairs.length);
      let pinned = false;
      pairs.forEach(([question, answer], index) => {
        const askerUserId = askers[index];
        if (!askerUserId) return;
        const createdAt = new Date(Math.min(now.getTime() - 3_600_000, task.publishedAt.getTime() + rng.int(30, 600) * 60_000));
        const answered = rng.chance(0.75);
        const answeredAt = answered ? new Date(Math.min(now.getTime(), createdAt.getTime() + rng.int(10, 240) * 60_000)) : null;
        const pin = answered && !pinned && rng.chance(0.5);
        if (pin) pinned = true;
        out.push({ id: `tqn_demo_${key}_${String(++n).padStart(3, '0')}`, taskId: task.id, askerUserId, body: question, answerBody: answered ? answer : null, answeredAt, pinned: pin, createdAt });
      });
    }
  }
  return out;
}
