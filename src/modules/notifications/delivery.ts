import { and, asc, eq, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import type { AttentionTarget, NotificationChannel, NotificationTopic, NotificationType, NotificationView } from '@/contracts';
import { NOTIFICATION_CHANNELS, routes } from '@/contracts';
import { createEmailProvider, type EmailProvider } from '@/integrations/email';
import { createSmsSender, type SmsSender } from '@/integrations/sms';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { formatMoney } from '@/shared/format';
import appMessages from '../../../messages/en/app';
import { NOTIFICATION_TOPIC, planDelivery, preferenceOn, RETRY_MINUTES } from './delivery-domain';
import { renderNotificationEmail } from './emails';
import { emailSuppressions, notificationDeliveries, notificationPreferences, notifications } from './schema';

/**
 * Email and text messages for in-app notifications (backlog B-028, blueprint 10 §3.2 T-29). The job runner
 * calls `deliverNotifications` every minute. Each notification gets one `notification_deliveries` row per
 * channel, claimed by inserting it, so two runs never send the same message twice. Texts that can wait are
 * held through quiet hours; failed sends are retried, then stay failed for support to see.
 */

export interface DeliveryProviders {
  email: EmailProvider;
  sms: SmsSender;
}

export function createDeliveryProviders(db: Db): DeliveryProviders {
  return { email: createEmailProvider(db), sms: createSmsSender(db) };
}

const MINUTE = 60_000;
/** Older notifications (made before a person could get email, or while delivery was off) aren't sent. */
const RECENT_MS = 48 * 60 * MINUTE;
/** A send that never finished (the process stopped) is retried after this. */
const STUCK_MS = 10 * MINUTE;

type NotificationRow = typeof notifications.$inferSelect;
type DeliveryRow = typeof notificationDeliveries.$inferSelect;

const t = createTranslator({ locale: 'en', messages: appMessages, namespace: 'server.notifications' });

function pathOf(target: AttentionTarget): string {
  switch (target.kind) {
    case 'booking':
      return routes.app.booking(target.bookingId);
    case 'task':
      return routes.app.task(target.taskId);
    case 'thread':
      return routes.app.thread(target.threadId);
    case 'messages':
      return routes.app.messages();
    case 'find_work_task':
      return routes.app.findWorkTask(target.taskId);
    case 'onboarding':
      return routes.app.helperOnboarding(target.step);
    case 'earnings':
      return routes.app.earnings();
    case 'support_case':
      return routes.app.supportCase(target.caseId);
    case 'invite':
      return routes.app.offers(target.inviteId);
    case 'proposal':
      return routes.app.proposal(target.proposalId);
  }
}

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** One notification as an email (subject, text, designed version, unsubscribe headers) and a text message. */
export function deliveryContent(row: Pick<NotificationRow, 'type' | 'title' | 'actorName' | 'params' | 'target' | 'userId'>) {
  const params: NonNullable<NotificationView['params']> = row.params ?? {};
  const sentence = t(`types.${row.type as NotificationType}`, {
    title: row.title ?? t('taskFallback'),
    actorName: row.actorName ?? t('actorFallback'),
    hasAmount: params.amountCents === undefined ? 'no' : 'yes',
    amount: params.amountCents === undefined ? '' : formatMoney(params.amountCents),
    hasMinutes: params.minutes === undefined ? 'no' : 'yes',
    minutes: params.minutes ?? 0,
    hasHours: params.hours === undefined ? 'no' : 'yes',
    hours: params.hours ?? 0,
  });
  const url = `${appUrl()}${pathOf(row.target)}`;
  const type = row.type as NotificationType;
  const email = renderNotificationEmail({ type, topic: NOTIFICATION_TOPIC[type], sentence, target: row.target, url, userId: row.userId, appUrl: appUrl() });
  return { ...email, sms: t('sms', { sentence, url }) };
}

async function sendOne(providers: DeliveryProviders, delivery: DeliveryRow, to: string, content: ReturnType<typeof deliveryContent>) {
  if (delivery.channel === 'email') {
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
}

async function peopleOf(db: Db, userIds: string[]): Promise<Map<string, Person>> {
  if (userIds.length === 0) return new Map();
  const [rows, prefs] = await Promise.all([
    db.select({ id: users.id, email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(inArray(users.id, userIds)),
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds)),
  ]);
  const emails = rows.map((row) => row.email?.toLowerCase()).filter((email): email is string => Boolean(email));
  const suppressed = new Set(
    emails.length > 0 ? (await db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(inArray(emailSuppressions.email, emails))).map((row) => row.email) : [],
  );
  const people = new Map<string, Person>(
    rows.map((row) => [
      row.id,
      { email: row.email || null, emailSuppressed: suppressed.has(row.email?.toLowerCase() ?? ''), phone: row.phone, phoneVerified: row.phoneVerifiedAt !== null, preferences: new Map() },
    ]),
  );
  for (const pref of prefs) people.get(pref.userId)?.preferences.set(`${pref.topic}:${pref.channel}`, pref.enabled === 'true');
  return people;
}

const addressOf = (person: Person, channel: NotificationChannel) => (channel === 'email' ? person.email : person.phoneVerified ? person.phone : null);

/** Sends a claimed delivery and records the outcome: sent, or failed with the next try. */
async function attempt(db: Db, providers: DeliveryProviders, delivery: DeliveryRow, row: NotificationRow, to: string, now: Date): Promise<boolean> {
  try {
    await sendOne(providers, delivery, to, deliveryContent(row));
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

/** Plans new notifications (one row per channel) and sends what's due, oldest first. */
export async function deliverNotifications(db: Db, now: Date, providers: DeliveryProviders = createDeliveryProviders(db), limit = 100): Promise<{ sent: number }> {
  let sent = 0;

  const fresh = await db
    .select({ notification: notifications })
    .from(notifications)
    .leftJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
    .where(and(isNull(notificationDeliveries.id), gte(notifications.createdAt, new Date(now.getTime() - RECENT_MS))))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);
  const people = await peopleOf(db, [...new Set(fresh.map(({ notification }) => notification.userId))]);
  for (const { notification } of fresh) {
    const person = people.get(notification.userId);
    if (!person) continue;
    const topic: NotificationTopic | undefined = NOTIFICATION_TOPIC[notification.type as NotificationType];
    if (!topic) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const to = addressOf(person, channel);
      const plan = planDelivery({
        type: notification.type as NotificationType,
        channel,
        enabled: preferenceOn(person.preferences, topic, channel),
        hasAddress: to !== null,
        suppressed: person.emailSuppressed,
        now,
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
      if (claimed && plan.action === 'send' && to && (await attempt(db, providers, claimed, notification, to, now))) sent += 1;
    }
  }

  // Held through quiet hours, failed and due for another try, or stuck mid-send.
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
    const person = waiting.get(delivery.userId);
    const channel = delivery.channel as NotificationChannel;
    const to = person ? addressOf(person, channel) : null;
    const topic = NOTIFICATION_TOPIC[notification.type as NotificationType];
    // The person may have turned the channel off, or lost the address (or it bounced), while it waited.
    const stillOn = person && topic ? preferenceOn(person.preferences, topic, channel) : false;
    const bounced = channel === 'email' && person?.emailSuppressed === true;
    const skipReason = !to ? (channel === 'sms' ? 'no_verified_phone' : 'no_email') : bounced ? 'email_suppressed' : 'preference_off';
    const [claimed] = await db
      .update(notificationDeliveries)
      .set(stillOn && to && !bounced ? { status: 'sending', updatedAt: now } : { status: 'skipped', reason: skipReason, sendAfter: null, updatedAt: now })
      // Claimed only if nobody moved it meanwhile (a stuck send stays stuck until claimed here).
      .where(
        and(
          eq(notificationDeliveries.id, delivery.id),
          eq(notificationDeliveries.status, delivery.status),
          ...(delivery.status === 'sending' ? [lt(notificationDeliveries.updatedAt, stuckBefore)] : []),
        ),
      )
      .returning();
    if (claimed && claimed.status === 'sending' && to && (await attempt(db, providers, claimed, notification, to, now))) sent += 1;
  }
  return { sent };
}
