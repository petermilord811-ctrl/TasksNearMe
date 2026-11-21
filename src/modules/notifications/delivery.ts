import { and, asc, count, eq, gte, inArray, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import type { AppLocale, NotificationTopic, NotificationType, NotificationView, TimeZone } from '@/contracts';
import { DEFAULT_LOCALE, localeOrDefault } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { createEmailProvider, type EmailProvider } from '@/integrations/email';
import { createSmsSender, type SmsSender } from '@/integrations/sms';
import { users } from '@/modules/accounts/schema';
import { marketTimeZones } from '@/modules/markets/time-zone';
import { threadParticipants } from '@/modules/messaging/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { formatDatePhrase, formatMoney } from '@/shared/format';
import { localizedPath } from '@/shared/locale';
import { pushSenderFromEnv, type PushMessage, type PushSender } from '@/integrations/push/web-push';
import { channelsFor, missingAddressReason, NOTIFICATION_TOPIC, planDelivery, preferenceOn, pushOn, RETRY_MINUTES, URGENT_TYPES, type DeliveryChannel } from './delivery-domain';
import { renderNotificationEmail } from './emails';
import { notificationPath } from './paths';
import { shortCodeFor } from './short-links';
import { emailSuppressions, notificationDeliveries, notificationPreferences, notifications, pushSubscriptions } from './schema';

/**
 * Email and text messages for in-app notifications (backlog B-028, blueprint 10 §3.2 T-29). The job runner
 * calls `deliverNotifications` every minute. Each notification gets one `notification_deliveries` row per
 * channel, claimed by inserting it, so two runs never send the same message twice. Texts that can wait are
 * held through quiet hours; failed sends are retried, then stay failed for support to see.
 */

export interface DeliveryProviders {
  email: EmailProvider;
  sms: SmsSender;
  /** Notifications on devices; absent or null where push isn't set up. */
  push?: PushSender | null;
}

export function createDeliveryProviders(db: Db): DeliveryProviders {
  return { email: createEmailProvider(db), sms: createSmsSender(db), push: pushSenderFromEnv() };
}

const MINUTE = 60_000;
/** Older notifications (made before a person could get email, or while delivery was off) aren't sent. */
const RECENT_MS = 48 * 60 * MINUTE;
/** A send that never finished (the process stopped) is retried after this. */
const STUCK_MS = 10 * MINUTE;
/**
 * How long one run may spend sending (sweep MN7). It runs inside the job runner's lock, before the waitlist, privacy
 * and transfer jobs, so a slow provider mustn't hold it for long: what's left goes out with the next minute's run.
 * Checked before each notification; each send stops on its own after 15 s (Twilio, web push and email alike).
 */
export const DELIVERY_BUDGET_MS = 30_000;

type NotificationRow = typeof notifications.$inferSelect;
type DeliveryRow = typeof notificationDeliveries.$inferSelect;

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.notifications' }));

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * A sentence ends with one mark: a title's own "?" or "!", a masked name's "T." and Spanish "a.m." don't get a
 * second one ("Jordan T..", "mirror?."; messages pass J-M2).
 */
export const endOnce = (line: string) => line.replace(/([.?!…])\.$/u, '$1');

/**
 * One notification as an email (subject, text, designed version, unsubscribe headers), a text message and a
 * push, in the recipient's language. Their links are too (/es/... for Spanish, sweep MN12): opened signed out, or in
 * a browser set to another language, the page, sign-in and unsubscribe still come in the reader's language.
 */
export function deliveryContent(
  row: Pick<NotificationRow, 'type' | 'title' | 'actorName' | 'params' | 'target' | 'userId'> & { id?: string },
  locale: AppLocale = DEFAULT_LOCALE,
  timeZone?: TimeZone,
  /** The text message's short link (short-links.ts, messages pass J-M9); the email, push and bell keep the full one. */
  { shortCode }: { shortCode?: string | null } = {},
) {
  const t = tFor(locale);
  const params: NonNullable<NotificationView['params']> = row.params ?? {};
  const sentence = endOnce(t(`types.${row.type as NotificationType}`, {
    title: row.title ?? t('taskFallback'),
    actorName: row.actorName ?? t('actorFallback'),
    hasAmount: params.amountCents === undefined ? 'no' : 'yes',
    amount: params.amountCents === undefined ? '' : formatMoney(params.amountCents),
    hasMinutes: params.minutes === undefined ? 'no' : 'yes',
    minutes: params.minutes ?? 0,
    hasHours: params.hours === undefined ? 'no' : 'yes',
    hours: params.hours ?? 0,
    days: params.days ?? 0,
    track: params.track ?? 'other',
    hasDate: params.at === undefined && params.day === undefined ? 'no' : 'yes',
    // On the clock of the booking or series it's about (its params' zone), else the recipient's (completion plan 8.1).
    // Worded to sit in the sentence: "Tue, Nov 24 at 9:00 am", "martes 24 de noviembre a las 9:00 a.m." (messages pass J-M3).
    date: params.at ? formatDatePhrase(params.at, { locale, timeZone: params.timeZone ?? timeZone }) : params.day ? formatDatePhrase(`${params.day}T18:00:00.000Z`, { locale, withTime: false }) : '',
    by: params.by ?? 'other',
    badge: params.badge ?? 'other',
    tier: params.tier ?? 1,
    count: params.count ?? 0,
    on: params.on ?? 'post',
    search: params.search ?? '',
    refundFor: params.refundFor ?? 'other',
  }));
  const url = `${appUrl()}${localizedPath(notificationPath(row.target), locale)}`;
  const type = row.type as NotificationType;
  // A cancellation receipt also says what happens to the money, and that the other person was told.
  const actorName = row.actorName ?? t('actorFallback');
  const details =
    type === 'booking_canceled_receipt'
      ? [t('receipt.money', { money: params.money ?? 'other', amount: params.amountCents === undefined ? '' : formatMoney(params.amountCents), actorName }), t('receipt.told', { actorName })].filter((line) => line !== '').map(endOnce)
      : [];
  const email = renderNotificationEmail({ type, topic: NOTIFICATION_TOPIC[type], sentence, details, target: row.target, url, userId: row.userId, appUrl: appUrl(), locale });
  return { ...email, sms: t('sms', { sentence, url: shortCode ? `${appUrl()}/n/${shortCode}` : url }), push: { title: t('pushTitle'), body: sentence, url, ...(row.id ? { tag: row.id } : {}) } };
}

/** One push to each of the person's devices; a device the push service says is gone is forgotten. */
async function sendPush(db: Db, sender: PushSender, userId: string, message: PushMessage, urgent: boolean, now: Date) {
  const devices = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  let retry = false;
  for (const device of devices) {
    const result = await sender.send({ endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth }, message, { urgent });
    if (result.status === 'sent') {
      sent += 1;
      await db.update(pushSubscriptions).set({ lastSentAt: now }).where(eq(pushSubscriptions.id, device.id));
    } else if (result.status === 'gone') {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
    } else if (result.retry) {
      retry = true;
    }
  }
  if (sent === 0) throw new Error(retry ? 'The push service is unavailable' : 'No device took the push');
}

async function sendOne(db: Db, providers: DeliveryProviders, delivery: DeliveryRow, row: NotificationRow, to: string, content: ReturnType<typeof deliveryContent>, now: Date) {
  if (delivery.channel === 'push') {
    if (!providers.push) throw new Error('Push is not set up');
    await sendPush(db, providers.push, delivery.userId, content.push, URGENT_TYPES.has(row.type as NotificationType), now);
  } else if (delivery.channel === 'email') {
    await providers.email.send({
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      tag: 'notification',
      ...(content.headers ? { headers: content.headers } : {}),
      // A retry of the same delivery is sent once (Resend keeps the key for 24 hours).
      idempotencyKey: delivery.id,
    });
  } else {
    await providers.sms.send({ to, text: content.sms });
  }
}

interface Person {
  email: string | null;
  /** The address bounced or complained: no more notification email goes to it. */
  emailSuppressed: boolean;
  phone: string | null;
  phoneVerified: boolean;
  preferences: Map<string, boolean>;
  /** Devices with notifications on. */
  pushDevices: number;
  /** The language their notifications go out in. */
  locale: AppLocale;
  /** Their home market's time zone: quiet hours, and the times their notifications name (completion plan 8.1). */
  timeZone: TimeZone;
}

async function peopleOf(db: Db, userIds: string[]): Promise<Map<string, Person>> {
  if (userIds.length === 0) return new Map();
  const [rows, prefs, devices] = await Promise.all([
    db.select({ id: users.id, email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, locale: users.locale, homeMarketId: users.homeMarketId }).from(users).where(inArray(users.id, userIds)),
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds)),
    db.select({ userId: pushSubscriptions.userId, devices: count() }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)).groupBy(pushSubscriptions.userId),
  ]);
  const devicesOf = new Map(devices.map((row) => [row.userId, row.devices]));
  const zones = await marketTimeZones(db, rows.map((row) => row.homeMarketId));
  const emails = rows.map((row) => row.email?.toLowerCase()).filter((email): email is string => Boolean(email));
  const suppressed = new Set(
    emails.length > 0 ? (await db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(inArray(emailSuppressions.email, emails))).map((row) => row.email) : [],
  );
  const people = new Map<string, Person>(
    rows.map((row) => [
      row.id,
      { email: row.email || null, emailSuppressed: suppressed.has(row.email?.toLowerCase() ?? ''), phone: row.phone, phoneVerified: row.phoneVerifiedAt !== null, preferences: new Map(), pushDevices: devicesOf.get(row.id) ?? 0, locale: localeOrDefault(row.locale), timeZone: zones.get(row.homeMarketId)! },
    ]),
  );
  for (const pref of prefs) people.get(pref.userId)?.preferences.set(`${pref.topic}:${pref.channel}`, pref.enabled === 'true');
  return people;
}

/**
 * A message notification that's no longer news (sweep MN9): the person read the conversation, which reads its message
 * notifications (MN1), or one of the two blocked the other. Whatever of it hasn't gone out yet is dropped: a text or
 * push held through quiet hours, a send waiting for another try, or a fresh one read before this run.
 */
async function staleMessage(db: Db, row: NotificationRow): Promise<'already_read' | 'blocked' | null> {
  if (row.type !== 'message_received' || row.target.kind !== 'thread') return null;
  if (row.readAt) return 'already_read';
  const [other] = await db
    .select({ userId: threadParticipants.userId })
    .from(threadParticipants)
    .where(and(eq(threadParticipants.threadId, row.target.threadId), ne(threadParticipants.userId, row.userId)))
    .limit(1);
  return other && (await isBlockedBetween(db, row.userId, other.userId)) ? 'blocked' : null;
}

const addressOf = (person: Person, channel: DeliveryChannel) =>
  channel === 'email' ? person.email : channel === 'push' ? (person.pushDevices > 0 ? 'devices' : null) : person.phoneVerified ? person.phone : null;
const channelOn = (person: Person, topic: NotificationTopic, channel: DeliveryChannel) => (channel === 'push' ? pushOn(topic) : preferenceOn(person.preferences, topic, channel));

/** Sends a claimed delivery and records the outcome: sent, or failed with the next try. */
async function attempt(db: Db, providers: DeliveryProviders, delivery: DeliveryRow, row: NotificationRow, to: string, now: Date, person: Pick<Person, 'locale' | 'timeZone'>): Promise<boolean> {
  try {
    // A text links through the notification's short code, made with its first text (messages pass J-M9).
    const shortCode = delivery.channel === 'sms' ? (row.shortCode ?? (await shortCodeFor(db, row.id))) : undefined;
    await sendOne(db, providers, delivery, row, to, deliveryContent(row, person.locale, person.timeZone, { shortCode }), now);
    await db.update(notificationDeliveries).set({ status: 'sent', sentAt: now, attempts: delivery.attempts + 1, reason: null, sendAfter: null, updatedAt: now }).where(eq(notificationDeliveries.id, delivery.id));
    return true;
  } catch (error) {
    const attempts = delivery.attempts + 1;
    const retryIn = RETRY_MINUTES[attempts - 1];
    await db
      .update(notificationDeliveries)
      .set({
        status: 'failed',
        attempts,
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        sendAfter: retryIn === undefined ? null : new Date(now.getTime() + retryIn * MINUTE),
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    return false;
  }
}

/** Plans new notifications (one row per channel) and sends what's due, oldest first, for up to `budgetMs`. */
export async function deliverNotifications(db: Db, now: Date, providers: DeliveryProviders = createDeliveryProviders(db), limit = 100, budgetMs = DELIVERY_BUDGET_MS): Promise<{ sent: number }> {
  let sent = 0;
  // Real time, not `now` (the test clock moves that one).
  const started = performance.now();
  const outOfTime = () => performance.now() - started > budgetMs;

  const fresh = await db
    .select({ notification: notifications })
    .from(notifications)
    .leftJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
    .where(and(isNull(notificationDeliveries.id), gte(notifications.createdAt, new Date(now.getTime() - RECENT_MS))))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);
  const people = await peopleOf(db, [...new Set(fresh.map(({ notification }) => notification.userId))]);
  for (const { notification } of fresh) {
    // Between notifications only: one whose channels were planned is never fresh again, so all of them go now.
    if (outOfTime()) return { sent };
    const person = people.get(notification.userId);
    if (!person) continue;
    const topic: NotificationTopic | undefined = NOTIFICATION_TOPIC[notification.type as NotificationType];
    if (!topic) continue;
    const stale = await staleMessage(db, notification);
    // A receipt goes by email only (no rows for the other channels).
    for (const channel of channelsFor(notification.type as NotificationType)) {
      // Push only where it's set up (no rows otherwise).
      if (channel === 'push' && !providers.push) continue;
      const to = addressOf(person, channel);
      const plan = planDelivery({
        type: notification.type as NotificationType,
        channel,
        enabled: channelOn(person, topic, channel),
        hasAddress: to !== null,
        suppressed: person.emailSuppressed,
        ...(stale ? { stale } : {}),
        now,
        timeZone: person.timeZone,
      });
      const [claimed] = await db
        .insert(notificationDeliveries)
        .values({
          id: newId('dlv'),
          notificationId: notification.id,
          userId: notification.userId,
          channel,
          status: plan.action === 'send' ? 'sending' : plan.action === 'hold' ? 'held' : 'skipped',
          reason: plan.action === 'skip' ? plan.reason : plan.action === 'hold' ? 'quiet_hours' : null,
          sendAfter: plan.action === 'hold' ? plan.until : null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [notificationDeliveries.notificationId, notificationDeliveries.channel] })
        .returning();
      if (claimed && plan.action === 'send' && to && (await attempt(db, providers, claimed, notification, to, now, person))) sent += 1;
    }
  }

  // Held through quiet hours, failed and due for another try, or stuck mid-send.
  if (outOfTime()) return { sent };
  const stuckBefore = new Date(now.getTime() - STUCK_MS);
  const due = await db
    .select({ delivery: notificationDeliveries, notification: notifications })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(
      or(
        and(inArray(notificationDeliveries.status, ['held', 'failed']), lte(notificationDeliveries.sendAfter, now)),
        and(eq(notificationDeliveries.status, 'sending'), lt(notificationDeliveries.updatedAt, stuckBefore)),
      ),
    )
    .orderBy(asc(notificationDeliveries.sendAfter))
    .limit(limit);
  const waiting = await peopleOf(db, [...new Set(due.map(({ delivery }) => delivery.userId))]);
  for (const { delivery, notification } of due) {
    if (outOfTime()) break;
    const person = waiting.get(delivery.userId);
    const channel = delivery.channel as DeliveryChannel;
    const to = person && (channel !== 'push' || providers.push) ? addressOf(person, channel) : null;
    const topic = NOTIFICATION_TOPIC[notification.type as NotificationType];
    // The person may have turned the channel off, or lost the address (or it bounced, or the device left), while it
    // waited; a message may have been read meanwhile.
    const stillOn = person && topic ? channelOn(person, topic, channel) : false;
    const bounced = channel === 'email' && person?.emailSuppressed === true;
    const skipReason = !to ? missingAddressReason(channel) : bounced ? 'email_suppressed' : !stillOn ? 'preference_off' : await staleMessage(db, notification);
    const [claimed] = await db
      .update(notificationDeliveries)
      .set(skipReason ? { status: 'skipped', reason: skipReason, sendAfter: null, updatedAt: now } : { status: 'sending', updatedAt: now })
      // Claimed only if nobody moved it meanwhile (a stuck send stays stuck until claimed here).
      .where(
        and(
          eq(notificationDeliveries.id, delivery.id),
          eq(notificationDeliveries.status, delivery.status),
          ...(delivery.status === 'sending' ? [lt(notificationDeliveries.updatedAt, stuckBefore)] : []),
        ),
      )
      .returning();
    if (claimed && claimed.status === 'sending' && to && person && (await attempt(db, providers, claimed, notification, to, now, person))) sent += 1;
  }
  return { sent };
}
