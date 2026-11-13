import { asc, desc, eq, inArray, or } from 'drizzle-orm';
import { accounts, agreements, users } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { invites } from '@/modules/invites/schema';
import { areas, categories } from '@/modules/markets/schema';
import { blocks, messages, threadParticipants } from '@/modules/messaging/schema';
import { notificationPreferences, notifications } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { reviews, savedHelpers } from '@/modules/reviews/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { supportCases } from '@/modules/support/schema';
import { taskLocations, taskMarks, tasks } from '@/modules/tasks/schema';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { addressVerifications, backgroundChecks, identityVerifications } from '@/modules/verification/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';

/**
 * A copy of everything linked to an account (blueprint 08 §5; completion plan 3.3), as one JSON file the
 * person keeps. Their own words and details are as written (their addresses decrypted). Other people
 * appear by display name only, and what others wrote passes through the app's own masking, so contact
 * details stay hidden here as they are in the app. Money is in US cents; times are UTC (ISO 8601).
 * Never included: other people's contact details, provider secrets or tokens, internal staff notes,
 * moderation reasons, or verification documents (proof-of-address files are deleted after review).
 */

export const DATA_EXPORT_FORMAT = 'tasksnearme-data-export/1';
const MESSAGE_LIMIT = 10_000;
const NOTIFICATION_LIMIT = 1_000;

const iso = (value: Date | string | null | undefined): string | null => (value instanceof Date ? value.toISOString() : (value ?? null));

/** What someone else wrote, with contact details hidden as the app hides them. */
function masked(text: string | null): string | null {
  if (text === null) return null;
  return toMessageSegments(text, { mask: true })
    .map((segment) => (segment.kind === 'text' ? segment.text : `[${segment.detail} hidden]`))
    .join('');
}

function pricingOf(row: { pricingType: string | null; priceCents: number | null; hourlyRateCents: number | null; estimatedHours: number | null; hoursCap: number | null }) {
  return row.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: row.hourlyRateCents, estimatedHours: row.estimatedHours, hoursCap: row.hoursCap }
    : { type: 'fixed', priceCents: row.priceCents };
}

export function dataExportFilename(now: Date): string {
  return `tasksnearme-data-${now.toISOString().slice(0, 10)}.json`;
}

export async function buildDataExport(db: Db, cipher: FieldCipher, userId: string, now: Date): Promise<Record<string, unknown> | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const decrypt = (ciphertext: string | null): unknown => {
    if (!ciphertext) return null;
    try {
      return JSON.parse(cipher.decrypt(ciphertext));
    } catch {
      return null;
    }
  };
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryOf = new Map(categoryRows.map((row) => [row.id, row.slug]));
  const names = new Map<string, string>();
  const nameOf = async (ids: (string | null)[]) => {
    const missing = [...new Set(ids.filter((id): id is string => Boolean(id) && !names.has(id!)))];
    if (missing.length) for (const row of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, missing))) names.set(row.id, row.name);
  };
  const who = (id: string | null) => (!id ? 'TasksNearMe' : id === userId ? 'you' : (names.get(id) ?? 'someone'));

  // ---- The account ----
  const signIns = await db.select({ provider: accounts.providerId, createdAt: accounts.createdAt }).from(accounts).where(eq(accounts.userId, userId));
  const agreementRows = await db.select().from(agreements).where(eq(agreements.userId, userId)).orderBy(asc(agreements.acceptedAt));
  const preferenceRows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));

  // ---- Helping ----
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  const [profileArea] = profile?.areaId ? await db.select({ name: areas.name }).from(areas).where(eq(areas.id, profile.areaId)).limit(1) : [];
  const serviceRows = profile ? await db.select().from(helperServices).where(eq(helperServices.userId, userId)) : [];
  const sampleRows = profile ? await db.select().from(helperWorkSamples).where(eq(helperWorkSamples.userId, userId)).orderBy(asc(helperWorkSamples.position)) : [];
  const availabilityRows = await db.select().from(availabilityPosts).where(eq(availabilityPosts.helperUserId, userId)).orderBy(desc(availabilityPosts.startAt));

  // ---- Verification (statuses and dates; documents and reports stay out) ----
  const identityRows = await db.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(asc(identityVerifications.createdAt));
  const backgroundRows = await db.select().from(backgroundChecks).where(eq(backgroundChecks.userId, userId)).orderBy(asc(backgroundChecks.createdAt));
  const addressRows = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, userId)).orderBy(asc(addressVerifications.createdAt));

  // ---- Tasks, offers, invites, bookings ----
  const taskRows = await db.select().from(tasks).where(eq(tasks.posterUserId, userId)).orderBy(asc(tasks.createdAt));
  const locationIds = taskRows.map((row) => row.locationId).filter((id): id is string => Boolean(id));
  const locationRows = locationIds.length ? await db.select().from(taskLocations).where(inArray(taskLocations.id, locationIds)) : [];
  const addressOfLocation = new Map(locationRows.map((row) => [row.id, decrypt(row.addressEnc)]));
  const taskIds = taskRows.map((row) => row.id);
  const offersReceived = taskIds.length ? await db.select().from(offers).where(inArray(offers.taskId, taskIds)).orderBy(asc(offers.createdAt)) : [];
  const offersMade = await db.select().from(offers).where(eq(offers.helperUserId, userId)).orderBy(asc(offers.createdAt));
  const inviteRows = await db.select().from(invites).where(or(eq(invites.posterUserId, userId), eq(invites.helperUserId, userId))).orderBy(asc(invites.createdAt));
  const bookingRows = await db.select().from(bookings).where(or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))).orderBy(asc(bookings.startAt));
  const otherTaskIds = [...new Set([...offersMade.map((row) => row.taskId), ...inviteRows.map((row) => row.taskId), ...bookingRows.map((row) => row.taskId)])].filter((id) => !taskIds.includes(id));
  const titleOf = new Map(taskRows.map((row) => [row.id, row.title]));
  if (otherTaskIds.length) for (const row of await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, otherTaskIds))) titleOf.set(row.id, row.title);
  const marks = await db.select().from(taskMarks).where(eq(taskMarks.userId, userId));

  // ---- Money ----
  const paymentRows = await db.select().from(payments).where(eq(payments.payerUserId, userId)).orderBy(asc(payments.createdAt));
  const refundRows = paymentRows.length ? await db.select().from(refunds).where(inArray(refunds.paymentId, paymentRows.map((row) => row.id))).orderBy(asc(refunds.createdAt)) : [];
  const methodRows = await db.select().from(paymentMethods).where(eq(paymentMethods.userId, userId)).orderBy(asc(paymentMethods.createdAt));
  const earningRows = await db.select().from(earnings).where(eq(earnings.helperUserId, userId)).orderBy(asc(earnings.createdAt));
  const payoutRows = await db.select().from(payouts).where(eq(payouts.helperUserId, userId)).orderBy(asc(payouts.createdAt));
  const rewardRows = await db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, userId)).orderBy(asc(rewardGrants.createdAt));

  // ---- Reviews, people, messages, support, notifications ----
  const reviewsWritten = await db.select().from(reviews).where(eq(reviews.authorUserId, userId)).orderBy(asc(reviews.createdAt));
  const reviewsAbout = (await db.select().from(reviews).where(eq(reviews.subjectUserId, userId)).orderBy(asc(reviews.createdAt))).filter((row) => row.status === 'published');
  const savedRows = await db.select().from(savedHelpers).where(eq(savedHelpers.userId, userId));
  const blockRows = await db.select().from(blocks).where(eq(blocks.blockerId, userId));
  const threadIds = (await db.select({ threadId: threadParticipants.threadId }).from(threadParticipants).where(eq(threadParticipants.userId, userId))).map((row) => row.threadId);
  const messageRows = threadIds.length
    ? await db.select().from(messages).where(inArray(messages.threadId, threadIds)).orderBy(asc(messages.createdAt)).limit(MESSAGE_LIMIT)
    : [];
  const caseRows = await db.select().from(supportCases).where(eq(supportCases.openedByUserId, userId)).orderBy(asc(supportCases.createdAt));
  const notificationRows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(NOTIFICATION_LIMIT);

  await nameOf([
    ...offersReceived.map((row) => row.helperUserId),
    ...inviteRows.flatMap((row) => [row.posterUserId, row.helperUserId]),
    ...bookingRows.flatMap((row) => [row.posterUserId, row.helperUserId]),
    ...reviewsAbout.map((row) => row.authorUserId),
    ...reviewsWritten.map((row) => row.subjectUserId),
    ...savedRows.map((row) => row.helperUserId),
    ...blockRows.map((row) => row.blockedId),
    ...messageRows.map((row) => row.senderUserId),
  ]);

  return {
    format: DATA_EXPORT_FORMAT,
    generatedAt: now.toISOString(),
    about:
      'Everything linked to your TasksNearMe account. Money is in US cents and times are UTC. Other people appear by their display name only, and their contact details stay hidden, as they do in the app.',
    account: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.name,
      phone: user.phone,
      phoneVerifiedAt: iso(user.phoneVerifiedAt),
      mode: user.mode,
      status: user.status,
      createdAt: iso(user.createdAt),
      termsAcceptedAt: iso(user.termsAcceptedAt),
      termsVersion: user.termsVersion,
      adultAttestedAt: iso(user.adultAttestedAt),
      signInMethods: [{ method: 'email code', since: iso(user.createdAt) }, ...signIns.filter((row) => row.provider !== 'credential').map((row) => ({ method: row.provider, since: iso(row.createdAt) }))],
    },
    agreements: agreementRows.map((row) => ({ document: row.doc, version: row.version, acceptedAt: iso(row.acceptedAt), ip: row.ip, browser: row.userAgent })),
    notificationPreferences: preferenceRows.map((row) => ({ topic: row.topic, channel: row.channel, enabled: row.enabled === 'true' })),
    helperProfile: profile
      ? {
          handle: profile.handle,
          headline: profile.headline,
          bio: profile.bio,
          status: profile.status,
          area: profileArea?.name ?? null,
          serviceRadiusKm: profile.serviceRadiusKm,
          remoteWork: profile.remoteOk,
          tools: profile.tools,
          languages: profile.languages,
          idVerifiedAt: profile.idVerifiedAt,
          backgroundCheckedAt: profile.backgroundCheckedAt,
          addressVerifiedAt: profile.addressVerifiedAt,
          services: serviceRows.map((row) => ({ category: categoryOf.get(row.categoryId) ?? row.categoryId, pricingType: row.pricingType, fromPriceCents: row.fromPriceCents, hourlyRateCents: row.hourlyRateCents, minHours: row.minHours, description: row.description, status: row.status })),
          workSamples: sampleRows.map((row) => ({ category: row.categoryId ? (categoryOf.get(row.categoryId) ?? row.categoryId) : null, caption: row.caption, addedAt: iso(row.createdAt) })),
        }
      : null,
    availability: availabilityRows.map((row) => ({ category: categoryOf.get(row.categoryId) ?? row.categoryId, start: iso(row.startAt), end: iso(row.endAt), pricing: pricingOf(row), status: row.status })),
    verification: {
      identity: identityRows.map((row) => ({ provider: row.provider, status: row.status, failureReason: row.failureReason, verifiedAt: iso(row.verifiedAt), startedAt: iso(row.createdAt) })),
      backgroundChecks: backgroundRows.map((row) => ({ provider: row.provider, status: row.status, completedAt: iso(row.completedAt), validUntil: iso(row.expiresAt), startedAt: iso(row.createdAt) })),
      homeAddress: addressRows.map((row) => ({ status: row.status, address: decrypt(row.addressCiphertext), documentType: row.documentType, submittedAt: iso(row.submittedAt), decidedAt: iso(row.decidedAt), rejectionReason: row.rejectionReason, documentDeletedAt: iso(row.documentDeletedAt) })),
    },
    tasksPosted: taskRows.map((row) => ({
      id: row.id,
      title: row.title,
      category: categoryOf.get(row.categoryId) ?? row.categoryId,
      description: row.description,
      details: row.details,
      status: row.status,
      budget: { ...pricingOf({ ...row, priceCents: row.budgetCents }), expenseAllowanceCents: row.expenseAllowanceCents, expenseAllowanceNote: row.expenseAllowanceNote },
      window: { start: iso(row.windowStart), end: iso(row.windowEnd), flexible: row.flexible },
      address: row.locationId ? (addressOfLocation.get(row.locationId) ?? null) : null,
      postedAt: iso(row.publishedAt ?? row.createdAt),
    })),
    offersReceived: offersReceived.map((row) => ({ task: titleOf.get(row.taskId) ?? null, from: who(row.helperUserId), pricing: pricingOf(row), proposedStart: iso(row.proposedStart), message: masked(row.message), status: row.status, sentAt: iso(row.createdAt) })),
    offersMade: offersMade.map((row) => ({ task: titleOf.get(row.taskId) ?? null, pricing: pricingOf(row), proposedStart: iso(row.proposedStart), message: row.message, brings: row.brings, status: row.status, sentAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })),
    invites: inviteRows.map((row) => ({
      task: titleOf.get(row.taskId) ?? null,
      role: row.posterUserId === userId ? 'client' : 'helper',
      with: who(row.posterUserId === userId ? row.helperUserId : row.posterUserId),
      pricing: pricingOf(row),
      start: iso(row.startAt),
      message: row.posterUserId === userId ? row.message : masked(row.message),
      status: row.status,
      sentAt: iso(row.createdAt),
    })),
    bookings: bookingRows.map((row) => ({
      id: row.id,
      task: titleOf.get(row.taskId) ?? null,
      role: row.posterUserId === userId ? 'client' : 'helper',
      with: who(row.posterUserId === userId ? row.helperUserId : row.posterUserId),
      status: row.status,
      start: iso(row.startAt),
      completedAt: iso(row.completedAt),
      canceledAt: iso(row.canceledAt),
      cancelReason: row.cancelReason,
    })),
    savedAndHiddenTasks: marks.map((row) => ({ task: titleOf.get(row.taskId) ?? row.taskId, mark: row.kind, at: iso(row.createdAt) })),
    payments: paymentRows.map((row) => ({ booking: row.bookingId, purpose: row.purpose, amountCents: row.amountCents, status: row.status, card: row.methodLast4 ? `${row.methodBrand ?? 'card'} ending ${row.methodLast4}` : null, at: iso(row.createdAt) })),
    refunds: refundRows.map((row) => ({ booking: row.bookingId, amountCents: row.amountCents, reason: row.reason, status: row.status, at: iso(row.createdAt) })),
    paymentMethods: methodRows.map((row) => ({ brand: row.brand, last4: row.last4, expires: row.expMonth && row.expYear ? `${String(row.expMonth).padStart(2, '0')}/${row.expYear}` : null, default: row.isDefault, removedAt: iso(row.detachedAt), addedAt: iso(row.createdAt) })),
    earnings: earningRows.map((row) => ({ booking: row.bookingId, kind: row.kind, amountCents: row.amountCents, status: row.status, transferredAt: iso(row.transferredAt), at: iso(row.createdAt) })),
    payouts: payoutRows.map((row) => ({ amountCents: row.amountCents, status: row.status, arrivalDate: row.arrivalDate, bankLast4: row.bankLast4, at: iso(row.createdAt) })),
    rewards: rewardRows.map((row) => ({ program: row.program, amountCents: row.amountCents, status: row.status, earnedAt: iso(row.createdAt), deliveredAt: iso(row.deliveredAt) })),
    reviewsWritten: reviewsWritten.map((row) => ({ about: who(row.subjectUserId), booking: row.bookingId, rating: row.rating, tags: row.tags, text: row.body, status: row.status, publishedAt: iso(row.publishedAt), writtenAt: iso(row.createdAt) })),
    reviewsAboutYou: reviewsAbout.map((row) => ({ from: who(row.authorUserId), booking: row.bookingId, rating: row.rating, tags: row.tags, text: masked(row.body), publishedAt: iso(row.publishedAt) })),
    savedHelpers: savedRows.map((row) => ({ helper: who(row.helperUserId), savedAt: iso(row.createdAt) })),
    blocked: blockRows.map((row) => ({ person: who(row.blockedId), since: iso(row.createdAt) })),
    messages: messageRows
      .filter((row) => row.body)
      .map((row) => ({ conversation: row.threadId, from: who(row.senderUserId), text: row.senderUserId === userId ? row.body : masked(row.body), at: iso(row.createdAt) })),
    supportCases: caseRows.map((row) => ({ id: row.id, type: row.type, topic: row.topic, status: row.status, reason: row.reason, description: row.description, openedAt: iso(row.createdAt), outcome: row.resolutionSummary, resolvedAt: iso(row.resolvedAt) })),
    notifications: notificationRows.map((row) => ({ type: row.type, about: row.title, at: iso(row.createdAt), readAt: iso(row.readAt) })),
  };
}
