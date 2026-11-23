import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import type {
  AccountPageData,
  AccountProfileInput,
  ActionResult,
  AttentionTarget,
  NotificationsPageData,
  NotificationType,
  NotificationView,
  OnboardingStep,
} from '@/contracts';
import { accountProfileInputSchema, BADGE_CODES, DIRECT_MESSAGE_SETTINGS, localeOrDefault, NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS, type BadgeCode, type DirectMessageSetting } from '@/contracts';
import { smsAvailable } from '@/integrations/sms';
import { staffRoles, users } from '@/modules/accounts/schema';
import { remindApprovalsDue, remindUpcomingBookings } from '@/modules/bookings/reminders';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { messages, threadParticipants } from '@/modules/messaging/schema';
import { offers } from '@/modules/offers/schema';
import { avatarPhoto, MAX_PHOTO_BYTES } from '@/modules/files/photos';
import { initialsOf } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { getSignInMethods } from '@/modules/accounts/sign-in-methods';
import type { Db } from '@/platform/db/connect';
import { isForeignKeyViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { invites } from '@/modules/invites/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { helpersForAsk } from '@/modules/community/ask-alerts';
import { followNoticeKey } from '@/modules/community/domain';
import { followersOf, mutedOf } from '@/modules/community/follows';
import { areas, markets } from '@/modules/markets/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { instantSearchMatches } from '@/modules/searches/service';
import { reviews } from '@/modules/reviews/schema';
import { cancelReceiptMoney, cityLiveKey, EMAIL_ONLY_TYPES, isLockedPreference, preferenceOn, TEXTLESS_TOPICS } from './delivery-domain';
import { privacyViewOf } from '@/modules/privacy/requests';
import { requestIdentityAfterNameChange } from '@/modules/verification/tracks';
import { computeOnboarding } from '@/modules/verification/progress';
import { loadOnboardingState } from '@/modules/verification/state';
import { pushSetup } from './push';
import { flagBlockEvasion } from '@/modules/trust/card-fingerprints';
import { notificationPreferences, notifications } from './schema';
import { verificationNotificationFor } from './verification-plan';
import { helpersToAlert, replacementHelpers } from '@/modules/offers/task-alerts';
import { reactToEvent } from '@/modules/badges/reactions';
import { reactForOperations } from '@/modules/oncall/reactions';
import { publishRealtime } from '@/modules/realtime/reactions';
import { userChannel } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { marketTimeZone } from '@/modules/markets/time-zone';

/**
 * Notifications from outbox events (the dispatcher), the notifications page, and the account page
 * (profile, preferences, privacy requests). Until the job runner exists, the dispatcher runs lazily when
 * a person opens a page that shows notifications.
 */

type EventRow = typeof outboxEvents.$inferSelect;
type Payload = Record<string, unknown>;

interface Planned {
  userId: string;
  type: NotificationType;
  target: AttentionTarget;
  title?: string;
  actorName?: string;
  params?: NotificationView['params'];
  /**
   * The record that makes it once only, when that isn't the event (`notifications` is unique per source and person): a
   * city's launch message is keyed by the city (`cityLiveKey`), so a second go-live tells nobody twice.
   */
  sourceKey?: string;
}

/** Where a helper who isn't bookable yet goes on with setting up: the first step not done (the dashboard's own). */
async function nextSetupStep(db: Db, userId: string, now: Date): Promise<OnboardingStep> {
  const { firstIncomplete } = computeOnboarding((await loadOnboardingState(db, userId, now)).facts);
  return firstIncomplete === 'done' ? 'profile' : firstIncomplete;
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

async function nameOf(db: Db, userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.name;
}

async function taskTitle(db: Db, taskId: string | undefined): Promise<string | undefined> {
  if (!taskId) return undefined;
  const [task] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task?.title;
}

async function bookingContext(db: Db, bookingId: string | undefined) {
  if (!bookingId) return null;
  const [row] = await db
    .select({ id: bookings.id, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, title: tasks.title, marketId: bookings.marketId, startAt: bookings.startAt, confirmedAt: bookings.confirmedAt, paymentMode: bookings.paymentMode })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

async function communityPost(db: Db, postId: string | undefined) {
  if (!postId) return null;
  const [post] = await db.select({ id: communityPosts.id, title: communityPosts.title, authorUserId: communityPosts.authorUserId, status: communityPosts.status }).from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
  return post && post.status === 'visible' ? post : null;
}

/**
 * Who hears about an event, and how. `onlyUserId` (deliverPending, for one person's page) lets the costly cases
 * look at that one person only.
 */
/** Who an event notifies, and how (exported for tests). */
export async function planNotifications(db: Db, event: EventRow): Promise<Planned[]> {
  return plan(db, event);
}

async function plan(db: Db, event: EventRow, onlyUserId?: string): Promise<Planned[]> {
  const p = event.payload as Payload;
  switch (event.type) {
    // The community (completion plan 7.7): never about your own act, never between people who blocked each other.
    // A reply tells, once each: the post's author; the person it answers ("Replying to…", plan 10.10); a helper it
    // recommends (plan 10.11); then the post's followers, at most once a post an hour each (plan 10.9). Nobody who muted
    // the post hears about it.
    case 'community.replied': {
      const post = await communityPost(db, text(p.postId));
      const replier = text(p.replierUserId);
      if (!post || !replier) return [];
      const replyId = text(p.replyId);
      const [reply] = replyId
        ? await db.select({ status: communityReplies.status, replyToId: communityReplies.replyToId, recommendedHelperUserId: communityReplies.recommendedHelperUserId }).from(communityReplies).where(eq(communityReplies.id, replyId)).limit(1)
        : [];
      if (reply && reply.status !== 'visible') return [];
      const [answered] = reply?.replyToId
        ? await db.select({ authorUserId: communityReplies.authorUserId }).from(communityReplies).where(and(eq(communityReplies.id, reply.replyToId), eq(communityReplies.status, 'visible'))).limit(1)
        : [];
      const recommended = reply?.recommendedHelperUserId ?? undefined;
      const blockedWithReplier = new Set(await blockedPeopleOf(db, replier));
      const muted = await mutedOf(db, post.id, [post.authorUserId, ...(answered ? [answered.authorUserId] : []), ...(recommended ? [recommended] : [])]);
      const told = new Set<string>([replier]);
      const may = (userId: string) => !told.has(userId) && !blockedWithReplier.has(userId) && !muted.has(userId);
      const actorName = await nameOf(db, replier);
      const target: AttentionTarget = { kind: 'community_post', postId: post.id };
      const planned: Planned[] = [];
      const tell = (userId: string, type: NotificationType) => {
        if (!may(userId)) return;
        planned.push({ userId, type, target, title: post.title, actorName });
        told.add(userId);
      };
      tell(post.authorUserId, 'community_reply');
      if (answered) tell(answered.authorUserId, 'community_mention');
      if (recommended) tell(recommended, 'community_recommended');
      const sourceKey = followNoticeKey(post.id, new Date(event.createdAt));
      for (const userId of await followersOf(db, post.id, [...told])) {
        if (!blockedWithReplier.has(userId)) planned.push({ userId, type: 'community_followed_reply', target, title: post.title, actorName, sourceKey });
      }
      return planned;
    }
    // A new post (plan 10.11): a thanked helper hears about it; a recommendation request with a service alerts the
    // helpers who offer it there.
    case 'community.posted': {
      const [post] = await db
        .select({ id: communityPosts.id, title: communityPosts.title, kind: communityPosts.kind, status: communityPosts.status, authorUserId: communityPosts.authorUserId, helperUserId: communityPosts.helperUserId, marketId: communityPosts.marketId, areaId: communityPosts.areaId, categorySlug: communityPosts.categorySlug })
        .from(communityPosts)
        .where(eq(communityPosts.id, text(p.postId) ?? event.aggregateId))
        .limit(1);
      if (!post || post.status !== 'visible') return [];
      const target: AttentionTarget = { kind: 'community_post', postId: post.id };
      if (post.kind === 'thanks' && post.helperUserId && post.helperUserId !== post.authorUserId) {
        if (await isBlockedBetween(db, post.helperUserId, post.authorUserId)) return [];
        if ((await mutedOf(db, post.id, [post.helperUserId])).size > 0) return [];
        return [{ userId: post.helperUserId, type: 'community_thanked', target, title: post.title, actorName: await nameOf(db, post.authorUserId) }];
      }
      if (post.kind !== 'recommendation' || !post.categorySlug) return [];
      // Where it was asked: the neighborhood, or the city for a citywide post.
      const [area] = post.areaId ? await db.select({ name: areas.name }).from(areas).where(eq(areas.id, post.areaId)).limit(1) : await db.select({ name: markets.name }).from(markets).where(eq(markets.id, post.marketId)).limit(1);
      const helpers = await helpersForAsk(db, post, new Date(event.createdAt));
      return helpers.map((userId) => ({ userId, type: 'community_ask_match' as const, target, title: post.title, params: { area: area?.name ?? '' } }));
    }
    // "Ask for help" made the thread a task (plan 10.12): the helpers neighbors named in it hear about it, unless a task
    // alert told them already.
    case 'community.task_linked': {
      const postId = text(p.postId);
      const taskId = text(p.taskId);
      const poster = text(p.posterUserId);
      if (!postId || !taskId || !poster) return [];
      const [task] = await db.select({ title: tasks.title, status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task || task.status !== 'open') return [];
      const named = await db
        .selectDistinct({ userId: communityReplies.recommendedHelperUserId })
        .from(communityReplies)
        .innerJoin(helperProfiles, eq(helperProfiles.userId, communityReplies.recommendedHelperUserId))
        .where(and(eq(communityReplies.postId, postId), eq(communityReplies.status, 'visible'), isNotNull(communityReplies.recommendedHelperUserId), ne(communityReplies.recommendedHelperUserId, poster), eq(helperProfiles.status, 'active')));
      const ids = named.map((row) => row.userId).filter((id): id is string => Boolean(id));
      if (ids.length === 0) return [];
      const blocked = new Set(await blockedPeopleOf(db, poster));
      const alerted = new Set(
        (await db.select({ userId: notifications.userId }).from(notifications).where(and(inArray(notifications.userId, ids), eq(notifications.type, 'task_match'), sql`${notifications.target}->>'taskId' = ${taskId}`))).map((row) => row.userId),
      );
      const posterName = await nameOf(db, poster);
      return ids.filter((id) => !blocked.has(id) && !alerted.has(id)).map((userId) => ({ userId, type: 'community_task_posted' as const, target: { kind: 'find_work_task', taskId } as AttentionTarget, title: task.title, actorName: posterName }));
    }
    // Hidden after reports (plan 10.21): its author hears it's with our team.
    case 'community.auto_hidden': {
      const author = text(p.authorUserId);
      const postId = text(p.postId);
      if (!author || !postId) return [];
      const [post] = await db.select({ title: communityPosts.title }).from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
      if (!post) return [];
      return [{ userId: author, type: 'community_auto_hidden', target: { kind: 'community_post', postId }, title: post.title, params: { on: p.targetKind === 'reply' ? 'reply' : 'post' } }];
    }
    // The weekly digest (plan 10.14, src/modules/community/digest.ts): by email only.
    case 'community.digest': {
      const userId = text(p.userId);
      const total = typeof p.count === 'number' ? p.count : undefined;
      if (!userId || !total) return [];
      const titles = Array.isArray(p.titles) ? p.titles.filter((title): title is string => typeof title === 'string').slice(0, 3) : [];
      const area = text(p.area);
      return [{ userId, type: 'community_digest', target: { kind: 'community' }, params: { count: total, waiting: typeof p.waiting === 'number' ? p.waiting : 0, ...(area ? { area } : {}), ...(titles.length > 0 ? { titles } : {}) } }];
    }
    case 'community.answer_pinned': {
      const post = await communityPost(db, text(p.postId));
      const answerer = text(p.replyAuthorUserId);
      if (!post || !answerer || post.authorUserId === answerer || (await isBlockedBetween(db, post.authorUserId, answerer))) return [];
      return [{ userId: answerer, type: 'community_answer_pinned', target: { kind: 'community_post', postId: post.id }, title: post.title, actorName: await nameOf(db, post.authorUserId) }];
    }
    case 'question.asked':
    case 'question.answered': {
      const taskId = text(p.taskId);
      const poster = text(p.posterUserId);
      const asker = text(p.askerUserId);
      if (!taskId || !poster || !asker || poster === asker || (await isBlockedBetween(db, poster, asker))) return [];
      const title = await taskTitle(db, taskId);
      return event.type === 'question.asked'
        ? [{ userId: poster, type: 'question_received', target: { kind: 'task', taskId }, title, actorName: await nameOf(db, asker) }]
        : [{ userId: asker, type: 'question_answered', target: { kind: 'find_work_task', taskId }, title, actorName: await nameOf(db, poster) }];
    }
    case 'searches.digest': {
      // One morning digest per person (sweep SS6, src/modules/searches/service.ts): one search names it and opens it;
      // several open the list, naming the one with the most.
      const userId = text(p.userId);
      const total = typeof p.count === 'number' ? p.count : undefined;
      if (!userId || !total) return [];
      const named = Array.isArray(p.searches)
        ? p.searches.flatMap((item) => {
            const search = (item ?? {}) as Payload;
            return typeof search.id === 'string' && typeof search.name === 'string' ? [{ id: search.id, name: search.name }] : [];
          })
        : [];
      if (named.length > 1) return [{ userId, type: 'saved_searches_digest', target: { kind: 'saved_searches' }, params: { count: total, search: named[0]!.name } }];
      const searchId = named[0]?.id ?? text(p.searchId);
      if (!searchId) return [];
      return [{ userId, type: 'saved_search_digest', target: { kind: 'saved_search', searchId }, params: { count: total, search: named[0]?.name ?? text(p.name) ?? '' } }];
    }
    case 'reviews.published': {
      // Each review published now is told to the person it's about, never its author (sweep RV1: when only one person
      // reviewed, the 14-day publish told both that the other's review was out). It opens the reviews (RV2).
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      if (!booking) return [];
      const named = Array.isArray(p.reviews)
        ? p.reviews.flatMap((item) => {
            const pair = (item ?? {}) as Payload;
            return typeof pair.authorUserId === 'string' && typeof pair.subjectUserId === 'string' ? [{ authorUserId: pair.authorUserId, subjectUserId: pair.subjectUserId }] : [];
          })
        : // An event from before the payload named them: the booking's published reviews.
          await db.select({ authorUserId: reviews.authorUserId, subjectUserId: reviews.subjectUserId }).from(reviews).where(and(eq(reviews.bookingId, booking.id), eq(reviews.status, 'published')));
      const target: AttentionTarget = { kind: 'booking_review', bookingId: booking.id };
      const told: Planned[] = [];
      for (const { authorUserId, subjectUserId } of named) {
        if (subjectUserId !== booking.posterUserId && subjectUserId !== booking.helperUserId) continue;
        told.push({ userId: subjectUserId, type: 'review_published', target, title: booking.title, actorName: await nameOf(db, authorUserId) });
      }
      return told;
    }
    case 'reviews.prompt':
    case 'reviews.reminder': {
      // Leave a review (sweep RV4): at completion both people are asked; a few days before the 14 days end, whoever hasn't
      // reviewed yet (src/modules/reviews/service.ts names them). Someone who reviewed meanwhile isn't asked.
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      const people = Array.isArray(p.userIds) ? p.userIds.filter((id): id is string => typeof id === 'string') : [];
      if (!booking || people.length === 0) return [];
      const written = await db.select({ authorUserId: reviews.authorUserId }).from(reviews).where(eq(reviews.bookingId, booking.id));
      const target: AttentionTarget = { kind: 'booking_review', bookingId: booking.id };
      const days = typeof p.days === 'number' ? p.days : undefined;
      const asked: Planned[] = [];
      for (const userId of people) {
        if ((userId !== booking.posterUserId && userId !== booking.helperUserId) || written.some((row) => row.authorUserId === userId)) continue;
        const other = userId === booking.posterUserId ? booking.helperUserId : booking.posterUserId;
        const type: NotificationType = event.type === 'reviews.prompt' ? 'review_prompt' : 'review_reminder';
        asked.push({ userId, type, target, title: booking.title, actorName: await nameOf(db, other), ...(type === 'review_reminder' && days !== undefined ? { params: { days } } : {}) });
      }
      return asked;
    }
    case 'payment.refunded': {
      // Money nothing was owed for went back on its own (money review #8): the payer hears it, and why, so no refund comes
      // back unexplained.
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      const payer = text(p.payerUserId);
      if (!booking || !payer) return [];
      const refundFor = p.refundFor === 'late' || p.refundFor === 'second_tip' || p.refundFor === 'change' ? p.refundFor : undefined;
      const cents = typeof p.amountCents === 'number' ? p.amountCents : undefined;
      return [
        {
          userId: payer,
          type: 'payment_refunded' as const,
          target: { kind: 'booking', bookingId: booking.id } as AttentionTarget,
          title: booking.title,
          params: { ...(cents !== undefined ? { amountCents: cents } : {}), ...(refundFor ? { refundFor } : {}) },
        },
      ];
    }
    case 'community.helpful': {
      const post = await communityPost(db, text(p.postId));
      const author = text(p.authorUserId);
      const count = typeof p.count === 'number' ? p.count : undefined;
      if (!post || !author || !count) return [];
      return [{ userId: author, type: 'community_helpful', target: { kind: 'community_post', postId: post.id }, title: post.title, params: { count, on: p.targetKind === 'reply' ? 'reply' : 'post' } }];
    }
    case 'offer.submitted':
    case 'offer.revised': {
      const poster = text(p.posterUserId);
      const taskId = text(p.taskId);
      if (!poster || !taskId) return [];
      const [offer] = await db.select({ priceCents: offers.priceCents }).from(offers).where(eq(offers.id, event.aggregateId)).limit(1);
      return [
        {
          userId: poster,
          type: event.type === 'offer.submitted' ? 'offer_received' : 'offer_updated',
          target: { kind: 'task', taskId },
          title: await taskTitle(db, taskId),
          actorName: await nameOf(db, text(p.helperUserId)),
          ...(offer?.priceCents ? { params: { amountCents: offer.priceCents } } : {}),
        },
      ];
    }
    case 'task.reopened': {
      // Find a replacement: earlier offerers (never the helper who canceled) can offer again, and the most reliable
      // helpers the task suits hear a client needs someone (automated replacement matching, blueprint 01 P2).
      const taskId = text(p.taskId);
      if (!taskId) return [];
      const helpers = Array.isArray(p.helperUserIds) ? p.helperUserIds.filter((id): id is string => typeof id === 'string') : [];
      const canceled = text(p.canceledHelperUserId);
      const title = await taskTitle(db, taskId);
      const target = { kind: 'find_work_task', taskId } as AttentionTarget;
      const others = await replacementHelpers(db, taskId, [...helpers, ...(canceled ? [canceled] : [])], new Date(event.createdAt));
      const poster = text(p.posterUserId);
      return [
        ...helpers.map((userId) => ({ userId, type: 'task_reopened' as const, target, title })),
        ...others.map((userId) => ({ userId, type: 'replacement_needed' as const, target, title })),
        // When it happened on its own (the helper canceled), the client hears their task is open again.
        ...(p.automatic === true && poster ? [{ userId: poster, type: 'replacement_search_started' as const, target: { kind: 'task', taskId } as AttentionTarget, title, actorName: await nameOf(db, canceled) }] : []),
      ];
    }
    case 'offer.declined': {
      const helper = text(p.helperUserId);
      const taskId = text(p.taskId);
      // Declined because the task was canceled while the offer was open (offers/closing.ts): say so, not "wasn't selected".
      const type = p.reason === 'task_canceled' ? 'task_canceled' : 'offer_declined';
      return helper && taskId ? [{ userId: helper, type, target: { kind: 'find_work_task', taskId }, title: await taskTitle(db, taskId) }] : [];
    }
    case 'task.expired': {
      // Its window ended with nobody booked (src/modules/tasks/expiry.ts): the poster can post it again from its page.
      const taskId = text(p.taskId);
      const poster = text(p.posterUserId);
      return taskId && poster ? [{ userId: poster, type: 'task_expired', target: { kind: 'task', taskId }, title: await taskTitle(db, taskId) }] : [];
    }
    case 'booking.confirmed':
    case 'booking.on_my_way':
    case 'booking.running_late':
    case 'booking.cant_access':
    case 'booking.arrived':
    case 'booking.completion_submitted':
    case 'booking.completed':
    case 'booking.disputed':
    case 'booking.approval_reminder':
    case 'booking.start_reminder':
    case 'booking.canceled':
    case 'booking.tipped':
    case 'earnings.transferred': {
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      if (!booking) return [];
      const target: AttentionTarget = { kind: 'booking', bookingId: booking.id };
      const helperName = await nameOf(db, booking.helperUserId);
      const posterName = await nameOf(db, booking.posterUserId);
      const forHelper = (type: NotificationType, extra: Partial<Planned> = {}): Planned => ({ userId: booking.helperUserId, type, target, title: booking.title, actorName: posterName, ...extra });
      const forPoster = (type: NotificationType, extra: Partial<Planned> = {}): Planned => ({ userId: booking.posterUserId, type, target, title: booking.title, actorName: helperName, ...extra });
      switch (event.type) {
        case 'booking.confirmed': {
          // A booking from the helper's own proposal: rebook_accepted says it, with the date, so the helper hears it once
          // (journeys on a phone, J-H21; ab decided). The proposal holds the booking from the moment the client accepts.
          const [fromProposal] = await db.select({ id: rebookProposals.id }).from(rebookProposals).where(eq(rebookProposals.bookingId, booking.id)).limit(1);
          if (fromProposal) return [];
          // Who booked them and when, on the booking's clock (messages pass J-M5).
          return [forHelper('booking_confirmed', { params: { at: booking.startAt.toISOString(), timeZone: await marketTimeZone(db, booking.marketId) } })];
        }
        case 'booking.on_my_way':
          return [forPoster('helper_on_the_way')];
        case 'booking.running_late':
          return [forPoster('helper_running_late', typeof p.minutes === 'number' ? { params: { minutes: p.minutes } } : {})];
        case 'booking.cant_access':
          return [forPoster('cant_access')];
        case 'booking.arrived':
          return [forPoster('helper_arrived')];
        case 'booking.completion_submitted':
          return [forPoster('work_submitted')];
        case 'booking.completed':
          return [forHelper('work_approved')];
        case 'booking.disputed':
          return [forHelper('problem_reported')];
        case 'booking.start_reminder': {
          // The clock time too, so an email or a bell row read later still says when (messages pass J-M6).
          const extra: Partial<Planned> = { params: { ...(typeof p.hours === 'number' ? { hours: p.hours } : {}), at: booking.startAt.toISOString(), timeZone: await marketTimeZone(db, booking.marketId) } };
          return [forPoster('booking_reminder', extra), forHelper('booking_reminder', extra)];
        }
        case 'booking.approval_reminder': {
          const hours = typeof p.hours === 'number' ? p.hours : undefined;
          return [forPoster('approval_reminder', hours ? { params: { hours } } : {})];
        }
        case 'booking.canceled': {
          // Not the person who canceled: they did it on screen, and an urgent text or push about it was noise (sweep
          // MN10). A cancel by the system (unpaid, a missed deadline) names nobody and tells both.
          const actor = text(p.actorUserId);
          const told = [forPoster('booking_canceled'), forHelper('booking_canceled')].filter((item) => item.userId !== actor);
          // The one who canceled gets a receipt by email instead (the owner's choice, 2026-11-20): what was canceled, on
          // the booking's clock, and what happens to the money.
          const by = actor === booking.posterUserId ? 'poster' : actor === booking.helperUserId ? 'helper' : null;
          if (!by) return told;
          const reason = text(p.reason);
          const money = cancelReceiptMoney(by, {
            ...(reason ? { reason } : {}),
            ...(typeof p.refundCents === 'number' ? { refundCents: p.refundCents } : {}),
            ...(typeof p.helperCompensationCents === 'number' ? { compensationCents: p.helperCompensationCents } : {}),
            // Paid directly (2026-11-23): nothing went through TasksNearMe, so there's nothing to refund.
            paid: booking.confirmedAt !== null && booking.paymentMode !== 'direct',
          });
          const params: NotificationView['params'] = { by, at: booking.startAt.toISOString(), timeZone: await marketTimeZone(db, booking.marketId), ...money };
          return [...told, by === 'poster' ? forPoster('booking_canceled_receipt', { params }) : forHelper('booking_canceled_receipt', { params })];
        }
        case 'booking.tipped': {
          const cents = typeof p.amountCents === 'number' ? p.amountCents : undefined;
          return [forHelper('tip_received', cents ? { params: { amountCents: cents } } : {})];
        }
        case 'earnings.transferred': {
          const cents = typeof p.earningsCents === 'number' ? p.earningsCents : undefined;
          return [forHelper('earnings_transferred', { target: { kind: 'earnings' }, actorName: undefined, ...(cents ? { params: { amountCents: cents } } : {}) })];
        }
        default:
          return [];
      }
    }
    case 'change.proposed': {
      const bookingId = text(p.bookingId);
      const proposer = text(p.proposedByUserId);
      const ctx = await bookingContext(db, bookingId);
      if (!ctx || !bookingId || !proposer) return [];
      const other = ctx.posterUserId === proposer ? ctx.helperUserId : ctx.posterUserId;
      return [{ userId: other, type: 'change_proposed' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title: ctx.title, actorName: await nameOf(db, proposer) }];
    }
    case 'change.applied': {
      const bookingId = text(p.bookingId);
      const ctx = await bookingContext(db, bookingId);
      if (!ctx || !bookingId) return [];
      // Not the person who accepted it (sweep MN10); a change applied with no one named tells both.
      return [ctx.posterUserId, ctx.helperUserId]
        .filter((userId) => userId !== text(p.actorUserId))
        .map((userId) => ({ userId, type: 'change_applied' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title: ctx.title }));
    }
    case 'rebook.proposed':
    case 'rebook.accepted':
    case 'rebook.declined': {
      const proposalId = text(p.proposalId);
      const helperId = text(p.helperUserId);
      const posterId = text(p.posterUserId);
      if (!proposalId || !helperId || !posterId) return [];
      const [proposal] = await db.select({ fromBookingId: rebookProposals.fromBookingId, bookingId: rebookProposals.bookingId }).from(rebookProposals).where(eq(rebookProposals.id, proposalId)).limit(1);
      const title = (await bookingContext(db, proposal?.fromBookingId))?.title;
      if (event.type === 'rebook.proposed') {
        return [{ userId: posterId, type: 'rebook_proposed' as const, target: { kind: 'proposal', proposalId } as AttentionTarget, title, actorName: await nameOf(db, helperId) }];
      }
      const actorName = await nameOf(db, posterId);
      const bookingId = text(p.bookingId) ?? proposal?.bookingId ?? undefined;
      if (event.type === 'rebook.accepted') {
        if (!bookingId) return [];
        // The one notification for that moment, with the booking's date on its clock (booking_confirmed is skipped; J-H21).
        const booked = await bookingContext(db, bookingId);
        const params = booked ? { params: { at: booked.startAt.toISOString(), timeZone: await marketTimeZone(db, booked.marketId) } } : {};
        return [{ userId: helperId, type: 'rebook_accepted' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title, actorName, ...params }];
      }
      return [{ userId: helperId, type: 'rebook_declined' as const, target: { kind: 'proposal', proposalId } as AttentionTarget, title, actorName }];
    }
    case 'invite.sent':
    case 'invite.countered':
    case 'invite.accepted': {
      const inviteId = text(p.inviteId);
      const posterId = text(p.posterUserId);
      const helperId = text(p.helperUserId);
      if (!inviteId || !posterId || !helperId) return [];
      const [invite] = await db.select({ taskId: invites.taskId, bookingId: invites.bookingId }).from(invites).where(eq(invites.id, inviteId)).limit(1);
      const title = await taskTitle(db, invite?.taskId);
      if (event.type === 'invite.sent') {
        return [{ userId: helperId, type: 'invite_received' as const, target: { kind: 'invite', inviteId } as AttentionTarget, title, actorName: await nameOf(db, posterId) }];
      }
      const actorName = await nameOf(db, helperId);
      if (event.type === 'invite.countered') {
        return invite?.taskId ? [{ userId: posterId, type: 'invite_countered' as const, target: { kind: 'task', taskId: invite.taskId } as AttentionTarget, title, actorName }] : [];
      }
      const bookingId = text(p.bookingId) ?? invite?.bookingId ?? undefined;
      return bookingId ? [{ userId: posterId, type: 'invite_accepted' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title, actorName }] : [];
    }
    case 'support.replied': {
      const caseId = text(p.caseId);
      const userId = text(p.partyUserId);
      if (!caseId || !userId) return [];
      return [{ userId, type: 'support_replied' as const, target: { kind: 'support_case', caseId } as AttentionTarget, title: text(p.subject) }];
    }
    case 'support.resolved': {
      const caseId = text(p.caseId);
      const recipients = Array.isArray(p.recipientIds) ? (p.recipientIds as string[]) : [];
      if (!caseId) return [];
      return recipients.map((userId) => ({ userId, type: 'case_resolved' as const, target: { kind: 'support_case', caseId } as AttentionTarget, title: text(p.subject) }));
    }
    case 'task.posted': {
      // Helpers the new task suits (src/modules/offers/task-alerts.ts).
      const taskId = text(p.taskId);
      if (!taskId) return [];
      const [task] = await db.select({ title: tasks.title, budgetCents: tasks.budgetCents }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) return [];
      const helpers = await helpersToAlert(db, taskId, new Date(event.createdAt));
      // Saved searches with instant alerts that the task fits (completion plan 7.10), once per person, after the
      // helpers' own task alerts (someone already told about it isn't told twice).
      const searches = (await instantSearchMatches(db, taskId, new Date(event.createdAt), onlyUserId)).filter((match) => !helpers.includes(match.userId));
      return [
        ...helpers.map((userId) => ({
          userId,
          type: 'task_match' as const,
          target: { kind: 'find_work_task', taskId } as AttentionTarget,
          title: task.title,
          ...(task.budgetCents ? { params: { amountCents: task.budgetCents } } : {}),
        })),
        ...searches.map((match) => ({
          userId: match.userId,
          type: 'saved_search_match' as const,
          target: { kind: 'saved_search', searchId: match.searchId } as AttentionTarget,
          title: task.title,
          params: { search: match.name },
        })),
      ];
    }
    case 'series.started':
    case 'series.paused':
    case 'series.resumed':
    case 'series.stopped':
    case 'series.visit_skipped': {
      // Regular visits (blueprint 03 §7): the other person hears what one of them did; both hear what the system did.
      const seriesId = text(p.seriesId);
      if (!seriesId) return [];
      const [series] = await db
        .select({ posterUserId: bookingSeries.posterUserId, helperUserId: bookingSeries.helperUserId, title: tasks.title, marketId: bookingSeries.marketId })
        .from(bookingSeries)
        .innerJoin(tasks, eq(tasks.id, bookingSeries.templateTaskId))
        .where(eq(bookingSeries.id, seriesId))
        .limit(1);
      if (!series) return [];
      // Dates it names are on the series' market clock (completion plan 8.1).
      const timeZone = await marketTimeZone(db, series.marketId);
      const target: AttentionTarget = { kind: 'series', seriesId };
      const [posterName, helperName] = await Promise.all([nameOf(db, series.posterUserId), nameOf(db, series.helperUserId)]);
      const by = text(p.by);
      const toHelper = (type: NotificationType, params?: NotificationView['params']): Planned => ({ userId: series.helperUserId, type, target, title: series.title, actorName: posterName, ...(params ? { params } : {}) });
      const toPoster = (type: NotificationType, params?: NotificationView['params']): Planned => ({ userId: series.posterUserId, type, target, title: series.title, actorName: helperName, ...(params ? { params } : {}) });
      switch (event.type) {
        case 'series.started':
          return [toHelper('series_started')];
        case 'series.paused': {
          const until = text(p.until);
          return [toHelper('series_paused', until ? { day: until, timeZone } : undefined)];
        }
        case 'series.resumed':
          return by === 'system' ? [toHelper('series_resumed', { by: 'system' }), toPoster('series_resumed', { by: 'system' })] : [toHelper('series_resumed', { by: 'poster' })];
        case 'series.stopped': {
          const endsOn = text(p.endsOn);
          if (by === 'poster') return [toHelper('series_stopped', { by: 'poster' })];
          if (by === 'helper') return [toPoster('series_stopped', { by: 'helper', ...(endsOn ? { day: endsOn, timeZone } : {}) })];
          return [toHelper('series_stopped', { by: 'system' }), toPoster('series_stopped', { by: 'system' })];
        }
        default: {
          const start = text(p.start);
          const params = (who: 'poster' | 'helper' | 'payment'): NotificationView['params'] => ({ by: who, ...(start ? { at: start, timeZone } : {}) });
          if (by === 'poster') return [toHelper('series_visit_skipped', params('poster'))];
          if (by === 'helper') return [toPoster('series_visit_skipped', params('helper'))];
          return [toHelper('series_visit_skipped', params('payment')), toPoster('series_visit_skipped', params('payment'))];
        }
      }
    }
    case 'booking.funding_failed': {
      // A scheduled charge didn't go through: the client can still pay on the booking page until `payBy`.
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      if (!booking) return [];
      const payBy = text(p.payBy);
      return [{ userId: booking.posterUserId, type: 'scheduled_payment_failed' as const, target: { kind: 'booking', bookingId: booking.id } as AttentionTarget, title: booking.title, ...(payBy ? { params: { at: payBy, timeZone: await marketTimeZone(db, booking.marketId) } } : {}) }];
    }
    case 'verification.updated': {
      const planned = verificationNotificationFor(p);
      return planned ? [planned] : [];
    }
    case 'market.live': {
      // Launch rehearsal J-L2 (ab's decision): everyone with an account in the city hears it's live, once, in their own
      // language: clients are told to post a first task, helpers not bookable yet to finish setting up. Bookable, paused
      // and suspended helpers hear nothing new (task alerts already find the bookable ones), and neither does staff.
      // Accounts are why the waitlist's email skips an address as `has_account`: nobody gets both.
      const marketId = text(p.marketId) ?? event.aggregateId;
      const city = text(p.city);
      if (!marketId || !city) return [];
      const sourceKey = cityLiveKey(marketId);
      const people = await db
        .select({ userId: users.id, helperStatus: helperProfiles.status })
        .from(users)
        .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
        .where(and(
          eq(users.homeMarketId, marketId),
          eq(users.status, 'active'),
          ...(onlyUserId ? [eq(users.id, onlyUserId)] : []),
          sql`not exists (select 1 from ${staffRoles} where ${staffRoles.userId} = ${users.id})`,
          sql`not exists (select 1 from ${notifications} where ${notifications.userId} = ${users.id} and ${notifications.sourceEventId} = ${sourceKey})`,
        ));
      const planned: Planned[] = [];
      for (const person of people) {
        if (person.helperStatus === null) planned.push({ userId: person.userId, type: 'city_live_client', target: { kind: 'new_task' }, title: city, sourceKey });
        else if (person.helperStatus === 'draft') planned.push({ userId: person.userId, type: 'city_live_helper', target: { kind: 'onboarding', step: await nextSetupStep(db, person.userId, new Date(event.createdAt)) }, title: city, sourceKey });
      }
      return planned;
    }
    case 'badge.earned': {
      // Completion plan 6.4: a new badge or a higher tier, shown with the person's badges on the account page.
      const userId = text(p.userId);
      const badge = text(p.badge);
      if (!userId || !badge || !(BADGE_CODES as readonly string[]).includes(badge)) return [];
      return [{ userId, type: 'badge_earned' as const, target: { kind: 'account' } as AttentionTarget, params: { badge: badge as BadgeCode, tier: typeof p.tier === 'number' ? p.tier : 1 } }];
    }
    case 'reward.earned':
    case 'reward.ready': {
      // The welcome gift card was earned (its three checks passed), or a gift card is ready to pick (blueprint 05).
      const userId = text(p.userId);
      if (!userId) return [];
      const amountCents = typeof p.amountCents === 'number' ? p.amountCents : undefined;
      return [{ userId, type: event.type === 'reward.earned' ? ('reward_earned' as const) : ('reward_ready' as const), target: { kind: 'rewards' } as AttentionTarget, ...(amountCents !== undefined ? { params: { amountCents } } : {}) }];
    }
    case 'privacy.export_ready': {
      const userId = text(p.userId);
      return userId ? [{ userId, type: 'data_export_ready' as const, target: { kind: 'account' } as AttentionTarget }] : [];
    }
    case 'message.sent': {
      const threadId = text(p.threadId);
      const recipients = Array.isArray(p.recipientIds) ? (p.recipientIds as string[]) : [];
      if (!threadId) return [];
      const title = await taskTitle(db, text(p.taskId));
      const actorName = await nameOf(db, text(p.senderUserId));
      return recipients.map((userId) => ({ userId, type: 'message_received' as const, target: { kind: 'thread', threadId } as AttentionTarget, title, actorName }));
    }
    default:
      return [];
  }
}

/** Whether the person has a message from someone else in the conversation that they haven't read. */
async function unreadMessageIn(db: Db, userId: string, threadId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(threadParticipants, and(eq(threadParticipants.threadId, messages.threadId), eq(threadParticipants.userId, userId)))
    // `<>` leaves out the system's own lines too (no sender): the notification is about a message someone wrote.
    .where(and(eq(messages.threadId, threadId), ne(messages.senderUserId, userId), or(isNull(threadParticipants.lastReadAt), gt(messages.createdAt, threadParticipants.lastReadAt))))
    .limit(1);
  return row !== undefined;
}

/** A claim this old belongs to a dispatcher that stopped half-way: the event is taken again (at least once). */
const CLAIM_EXPIRES_MS = 5 * 60_000;

/**
 * Takes up to `limit` undispatched events for this dispatcher, oldest first, in one statement: the rows are locked
 * with FOR NO KEY UPDATE SKIP LOCKED while `claimed_at` is set, so dispatchers running at once (the job runner,
 * every signed-in page, the notifications page) never take the same event, and an on-call page goes out once.
 * Claims are kept on the database's clock, not the request's (5.19): a request on the test clock, days ahead,
 * would otherwise find every live claim stale and take it again.
 */
async function claimEvents(db: Db, limit: number) {
  const free = db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.dispatchedAt), or(isNull(outboxEvents.claimedAt), sql`${outboxEvents.claimedAt} < now() - ${CLAIM_EXPIRES_MS}::int * interval '1 millisecond'`)))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(limit)
    .for('no key update', { skipLocked: true });
  const claimed = await db.update(outboxEvents).set({ claimedAt: sql`now()` }).where(inArray(outboxEvents.id, free)).returning();
  return claimed.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Makes an event's notifications, one per event and person (idempotent); `onlyUserId`, just that person's. */
async function deliver(db: Db, event: EventRow, onlyUserId?: string): Promise<number> {
  let made = 0;
  const planned = await plan(db, event, onlyUserId);
  // Nobody is told anything once their account is deleted (privacy rehearsal J-PR5): no bell row, no email to the
  // address it left behind.
  const people = [...new Set(planned.map((item) => item.userId))];
  const gone = new Set(people.length ? (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, people), eq(users.status, 'deleted')))).map((row) => row.id) : []);
  for (const item of planned) {
    if (onlyUserId && item.userId !== onlyUserId) continue;
    if (gone.has(item.userId)) continue;
    // Several unread messages in one thread make one notification.
    if (item.type === 'message_received' && item.target.kind === 'thread') {
      const threadId = item.target.threadId;
      // None if they read the conversation after the message and before this ran (sweep MN13): the entry would sit
      // unread, and the next message would join it instead of telling them.
      if (!(await unreadMessageIn(db, item.userId, threadId))) continue;
      const unread = await db
        .select({ id: notifications.id, target: notifications.target })
        .from(notifications)
        .where(and(eq(notifications.userId, item.userId), eq(notifications.type, 'message_received'), isNull(notifications.readAt)));
      if (unread.some((row) => row.target.kind === 'thread' && row.target.threadId === threadId)) continue;
    }
    // Someone who is gone (a deleted account) can't get a notification; one bad event never blocks the rest.
    try {
      const inserted = await db
        .insert(notifications)
        .values({
          id: newId('ntf'),
          userId: item.userId,
          type: item.type,
          title: item.title ?? null,
          actorName: item.actorName ?? null,
          params: item.params ?? null,
          target: item.target,
          sourceEventId: item.sourceKey ?? event.id,
          createdAt: new Date(event.createdAt),
          // An email-only one (a receipt) is never unread in the bell.
          ...(EMAIL_ONLY_TYPES.has(item.type) ? { readAt: new Date(event.createdAt) } : {}),
        })
        .onConflictDoNothing({ target: [notifications.sourceEventId, notifications.userId] })
        .returning({ id: notifications.id });
      made += inserted.length;
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
    }
  }
  return made;
}

/**
 * One person's notifications from every event not dispatched yet (5.19): those other dispatchers hold right now
 * (the signed-in layout rendering beside the page, another page, the job runner), including one whose claim is
 * still being written, which this request's own claim skipped as locked while it still reads as unclaimed. Made
 * here too (idempotent), so the notifications page shows them at once; the dispatcher that claims an event still
 * runs its reactions and marks it dispatched.
 */
async function deliverPending(db: Db, userId: string, limit = 200): Promise<void> {
  const pending = await db.select().from(outboxEvents).where(isNull(outboxEvents.dispatchedAt)).orderBy(asc(outboxEvents.createdAt)).limit(limit);
  for (const event of pending) await deliver(db, event, userId);
}

/** Turns undispatched outbox events into notifications (idempotent), oldest first. */
export async function dispatchNotifications(db: Db, now: Date, limit = 200): Promise<number> {
  const pending = await claimEvents(db, limit);
  let made = 0;
  for (const event of pending) {
    made += await deliver(db, event);
    // What else changes with the event: founding numbers, completed counts, badges (src/modules/badges/reactions.ts).
    // A failure is logged and never holds up the notifications.
    try {
      await reactToEvent(db, event, now);
    } catch (error) {
      console.error(`[outbox] reacting to ${event.type} ${event.id} failed`, error);
    }
    // On-call pages and cases for events no screen handles (src/modules/oncall/reactions.ts, completion plan 5.12).
    try {
      await reactForOperations(db, event, now);
    } catch (error) {
      console.error(`[outbox] operations for ${event.type} ${event.id} failed`, error);
    }
    // Someone reaching a person who blocked another account on the same card: a case for staff (abuse rehearsal J-AB4).
    try {
      await flagBlockEvasion(db, event, now);
    } catch (error) {
      console.error(`[outbox] block-evasion check for ${event.type} ${event.id} failed`, error);
    }
    // Live notices for open pages (src/modules/realtime/reactions.ts, completion plan 7.1): ids only, after the
    // notifications above exist, here in the claimer's loop so other dispatchers' deliveries don't send twice.
    try {
      await publishRealtime(db, event);
    } catch (error) {
      console.error(`[outbox] live notices for ${event.type} ${event.id} failed`, error);
    }
    await db.update(outboxEvents).set({ dispatchedAt: now.toISOString() }).where(eq(outboxEvents.id, event.id));
  }
  return made;
}

export async function unreadNotificationCount(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/**
 * `/app/notifications`: the latest 50, newest first. The viewer's approval reminders due now are made first
 * (the job runner makes everyone's every minute), so the page never waits for the next run.
 */
export async function getNotificationsPage(db: Db, userId: string, now: Date): Promise<NotificationsPageData> {
  await remindApprovalsDue(db, now, { posterUserId: userId });
  await remindUpcomingBookings(db, now, { userId });
  await dispatchNotifications(db, now);
  await deliverPending(db, userId);
  // Email-only ones (receipts) aren't for the bell.
  const rows = await db.select().from(notifications).where(and(eq(notifications.userId, userId), notInArray(notifications.type, [...EMAIL_ONLY_TYPES]))).orderBy(desc(notifications.createdAt)).limit(50);
  return {
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      ...(row.title ? { title: row.title } : {}),
      ...(row.actorName ? { actorName: row.actorName } : {}),
      ...(row.params ? { params: row.params } : {}),
      target: row.target,
      createdAt: row.createdAt.toISOString(),
      ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
    })),
    unreadCount: await unreadNotificationCount(db, userId),
  };
}

/** The person's other devices hear their bell changed (sweep MN6): it lives in the shell, which a page doesn't redraw. */
async function noticeBellRead(db: Db, userId: string, read: number): Promise<void> {
  if (read > 0) await publishNotices(db, [{ channel: userChannel(userId), notice: { type: 'read' } }]);
}

export async function markNotificationRead(db: Db, userId: string, notificationId: string, now: Date): Promise<ActionResult> {
  const read = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.id, String(notificationId)), eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  await noticeBellRead(db, userId, read.length);
  return { ok: true, code: 'updated' };
}

export async function markAllNotificationsRead(db: Db, userId: string, now: Date): Promise<ActionResult> {
  const read = await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).returning({ id: notifications.id });
  await noticeBellRead(db, userId, read.length);
  return { ok: true, code: 'updated' };
}

// ---- The account page -------------------------------------------------------------------------------

const isLocked = isLockedPreference;

/** `returned`: what Better Auth adds after connecting Google or Microsoft (see getSignInMethods). */
export async function getAccountPage(db: Db, userId: string, returned: { connect?: unknown; error?: unknown } = {}, now: Date = new Date()): Promise<AccountPageData | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [prefRows, [profile], privacy, signIn] = await Promise.all([
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    privacyViewOf(db, userId, now),
    getSignInMethods(db, { id: user.id, email: user.email }, returned),
  ]);
  const stored = new Map(prefRows.map((row) => [`${row.topic}:${row.channel}`, row.enabled === 'true']));
  // No texts here (plan 9.2): no phone to ask for, and no text column.
  const texts = smsAvailable();
  return {
    profile: {
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.name,
      initials: initialsOf(user.firstName, user.lastName) || user.email.charAt(0).toUpperCase(),
      email: user.email,
      ...(user.avatarFileId ? { photo: avatarPhoto(user.avatarFileId, user.name) } : {}),
    },
    maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    ...(user.phone ? { phone: { last4: user.phone.slice(-4), verified: user.phoneVerifiedAt !== null } } : {}),
    ...(texts ? {} : { textsOff: true as const }),
    signIn,
    preferences: NOTIFICATION_TOPICS.flatMap((topic) =>
      NOTIFICATION_CHANNELS.filter((channel) => (texts || channel !== 'sms') && !(channel === 'sms' && TEXTLESS_TOPICS.has(topic))).map((channel) => {
        const locked = isLocked(topic, channel);
        const enabled = preferenceOn(stored, topic, channel);
        return { topic, channel, enabled, locked };
      }),
    ),
    helper: { status: (profile?.status as AccountPageData['helper']['status'] | undefined) ?? 'none' },
    privacy,
    ...(pushSetup() ? { push: pushSetup()! } : {}),
    language: localeOrDefault(user.locale),
    activity: { shown: user.showActivity },
    directMessages: { setting: (DIRECT_MESSAGE_SETTINGS as readonly string[]).includes(user.directMessages) ? (user.directMessages as DirectMessageSetting) : 'everyone' },
    // A "Not you?" link holds the email, phone and ways to sign in until staff clear it (completion plan 5.23).
    ...(user.contactHoldAt ? { contactChangesHeld: true } : {}),
  };
}

export async function saveAccountProfile(db: Db, userId: string, input: AccountProfileInput, now: Date): Promise<ActionResult> {
  const parsed = accountProfileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { firstName, lastName } = parsed.data;
  const [before] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ firstName, lastName, name: `${firstName} ${lastName.charAt(0).toUpperCase()}.`, updatedAt: now }).where(eq(users.id, userId));
  // A verified helper's new legal name needs a new ID check (plan 6.3).
  if (before) await requestIdentityAfterNameChange(db, userId, { before, after: { firstName, lastName } }, now);
  return { ok: true, code: 'saved' };
}

export async function saveNotificationPreference(db: Db, userId: string, input: { topic: string; channel: string; enabled: boolean }, now: Date): Promise<ActionResult> {
  if (!(NOTIFICATION_TOPICS as readonly string[]).includes(input.topic) || !(NOTIFICATION_CHANNELS as readonly string[]).includes(input.channel)) {
    return { ok: false, code: 'validation_failed' };
  }
  if (isLocked(input.topic, input.channel)) return { ok: false, code: 'not_allowed' };
  const values = { userId, topic: input.topic, channel: input.channel, enabled: input.enabled ? 'true' : 'false', updatedAt: now };
  await db
    .insert(notificationPreferences)
    .values(values)
    .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.topic, notificationPreferences.channel], set: { enabled: values.enabled, updatedAt: now } });
  return { ok: true, code: 'updated' };
}
