import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { localeOrDefault } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { accounts, agreements, passkeys, sessions, usernames, users } from '@/modules/accounts/schema';
import { availabilityPosts, neighborhoodDays } from '@/modules/availability/schema';
import { bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { invites } from '@/modules/invites/schema';
import { areas, categories, markets } from '@/modules/markets/schema';
import { blocks, messages, threadParticipants } from '@/modules/messaging/schema';
import { notificationPreferences, notifications, pushSubscriptions } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { reviews, savedHelpers } from '@/modules/reviews/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { supportCases } from '@/modules/support/schema';
import { communityEdits, communityPosts, communityReplies, communityWelcomes, neighborGroupMembers, neighborGroupMessages, neighborGroups } from '@/modules/community/schema';
import { bookingFollowers } from '@/modules/followers/schema';
import { notificationQuietHours } from '@/modules/notifications/schema';
import { bookingTeams } from '@/modules/teams/schema';
import { thankYouNotes } from '@/modules/thanks/schema';
import { taskQuestions } from '@/modules/questions/schema';
import { savedSearches } from '@/modules/searches/schema';
import { savedReplies } from '@/modules/messaging/schema';
import { files, taskLocations, taskMarks, taskPhotos, tasks } from '@/modules/tasks/schema';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications } from '@/modules/verification/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import type { FileStorage } from '@/integrations/storage';
import type { ZipEntry } from './zip';
import { subscriptions } from '@/modules/billing/schema';
import { sparkPurchases } from '@/modules/sparks/schema';

/**
 * A copy of everything linked to an account (blueprint 08 §5; completion plan 3.3), as one JSON file the
 * person keeps. Their own words and details are as written (their addresses decrypted). Other people
 * appear by display name only, and what others wrote passes through the app's own masking, so contact
 * details stay hidden here as they are in the app. Money is in US cents; times are UTC (ISO 8601).
 * The words in it are in the person's language (privacy rehearsal J-PR7); field names and status codes stay as they
 * are, for programs that read the file.
 * Never included: other people's contact details, provider secrets or tokens (sign-in tokens, passkeys' keys, push
 * endpoints), internal staff notes, moderation reasons, or verification documents (proof-of-address files and ID
 * photos are deleted after review).
 */

export const DATA_EXPORT_FORMAT = 'tasksnearme-data-export/1';
const MESSAGE_LIMIT = 10_000;
const NOTIFICATION_LIMIT = 1_000;

const iso = (value: Date | string | null | undefined): string | null => (value instanceof Date ? value.toISOString() : (value ?? null));

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.dataExport' }));

/** What someone else wrote, with contact details hidden as the app hides them. */
function masked(text: string | null, hidden: (detail: 'phone' | 'email' | 'link' | 'handle') => string): string | null {
  if (text === null) return null;
  return toMessageSegments(text, { mask: true })
    .map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : hidden(segment.detail)))
    .join('');
}

function pricingOf(row: { pricingType: string | null; priceCents: number | null; hourlyRateCents: number | null; estimatedHours: number | null; hoursCap: number | null }) {
  return row.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: row.hourlyRateCents, estimatedHours: row.estimatedHours, hoursCap: row.hoursCap }
    : { type: 'fixed', priceCents: row.priceCents };
}

/** The download: a zip of the JSON and the person's photos (privacy rehearsal J-PR10). */
export function dataExportFilename(now: Date): string {
  return `tasksnearme-data-${now.toISOString().slice(0, 10)}.zip`;
}

/** The JSON inside it. */
export function dataExportJsonName(now: Date): string {
  return `tasksnearme-data-${now.toISOString().slice(0, 10)}.json`;
}

const PHOTO_FOLDERS: Record<string, string> = { avatar: 'profile', task_photo: 'tasks', work_sample: 'work-samples', message: 'messages', community_photo: 'neighbors' };
const extensionOf = (contentType: string) => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'image/heic': 'heic' })[contentType] ?? 'bin';

/**
 * The photos the person added themselves, for the copy's zip (ab, 2026-11-21): their profile photo, their tasks'
 * photos, their work samples, the photos they sent in messages and those on their Neighbors posts and replies (plan
 * 10.1). Only files they own; never anyone else's, and never
 * identity documents or proofs of address (deleted within 30 days of our decision). A file storage no longer has (the
 * retention timer took it) is left out. Each is listed in the JSON with its place in the zip.
 */
export async function dataExportPhotos(db: Db, storage: FileStorage, userId: string): Promise<{ entries: ZipEntry[]; list: { file: string; kind: string; task: string | null; addedAt: string | null }[] }> {
  const [user] = await db.select({ avatarFileId: users.avatarFileId }).from(users).where(eq(users.id, userId)).limit(1);
  const samples = await db.select({ fileId: helperWorkSamples.fileId }).from(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
  const sent = await db.select({ ids: messages.attachmentFileIds }).from(messages).where(eq(messages.senderUserId, userId));
  const linked = [user?.avatarFileId ?? null, ...samples.map((row) => row.fileId), ...sent.flatMap((row) => (Array.isArray(row.ids) ? row.ids : []))].filter((id): id is string => Boolean(id));
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerUserId, userId), or(eq(files.kind, 'task_photo'), eq(files.kind, 'community_photo'), linked.length ? inArray(files.id, [...new Set(linked)]) : undefined)))
    .orderBy(asc(files.createdAt));
  const taskOf = new Map(
    rows.length ? (await db.select({ fileId: taskPhotos.fileId, title: tasks.title }).from(taskPhotos).innerJoin(tasks, eq(tasks.id, taskPhotos.taskId)).where(inArray(taskPhotos.fileId, rows.map((row) => row.id)))).map((row) => [row.fileId, row.title]) : [],
  );
  const entries: ZipEntry[] = [];
  const list: { file: string; kind: string; task: string | null; addedAt: string | null }[] = [];
  for (const row of rows) {
    const folder = PHOTO_FOLDERS[row.kind];
    if (!folder || !row.storageKey || row.storageKey.startsWith('public/')) continue;
    const body = await storage.get(row.storageKey);
    if (!body) continue;
    const name = `photos/${folder}/${row.id}.${extensionOf(row.contentType)}`;
    entries.push({ name, body });
    list.push({ file: name, kind: folder, task: taskOf.get(row.id) ?? null, addedAt: iso(row.createdAt) });
  }
  return { entries, list };
}

export async function buildDataExport(db: Db, cipher: FieldCipher, userId: string, now: Date): Promise<Record<string, unknown> | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [handle] = await db.select({ username: usernames.username }).from(usernames).where(eq(usernames.userId, userId)).limit(1);
  const t = tFor(localeOrDefault(user.locale));
  const hide = (text: string | null) => masked(text, (detail) => t('hidden', { detail }));
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
    if (missing.length) {
      for (const row of await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(inArray(users.id, missing))) {
        names.set(row.id, row.status === 'deleted' ? t('deletedAccount') : row.name);
      }
    }
  };
  const who = (id: string | null) => (!id ? 'TasksNearMe' : id === userId ? t('you') : (names.get(id) ?? t('someone')));

  // ---- The account ----
  const signIns = await db.select({ provider: accounts.providerId, createdAt: accounts.createdAt }).from(accounts).where(eq(accounts.userId, userId));
  const agreementRows = await db.select().from(agreements).where(eq(agreements.userId, userId)).orderBy(asc(agreements.acceptedAt));
  const preferenceRows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  const [homeMarket] = await db.select({ name: markets.name, state: markets.state }).from(markets).where(eq(markets.id, user.homeMarketId)).limit(1);
  // Where they're signed in, their passkeys and the devices that get their notifications (J-PR7): no token or key.
  const sessionRows = await db.select({ ip: sessions.ipAddress, browser: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, userId)).orderBy(asc(sessions.createdAt));
  const passkeyRows = await db.select({ name: passkeys.name, deviceType: passkeys.deviceType, backedUp: passkeys.backedUp, createdAt: passkeys.createdAt }).from(passkeys).where(eq(passkeys.userId, userId)).orderBy(asc(passkeys.createdAt));
  const pushRows = await db.select({ browser: pushSubscriptions.userAgent, createdAt: pushSubscriptions.createdAt, lastSentAt: pushSubscriptions.lastSentAt }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt));

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
  const captureRows = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId)).orderBy(asc(identityCaptures.createdAt));

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
  const planRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(asc(subscriptions.createdAt));
  const sparkRows = await db.select().from(sparkPurchases).where(eq(sparkPurchases.userId, userId)).orderBy(asc(sparkPurchases.createdAt));
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
  // Part 7: what they wrote in the community and on tasks, and what they keep (saved searches and replies).
  // Their messages in building and street groups (2026-11-24), with each group's name.
  const groupMessageRows = await db
    .select({ group: neighborGroups.name, body: neighborGroupMessages.body, status: neighborGroupMessages.status, createdAt: neighborGroupMessages.createdAt })
    .from(neighborGroupMessages)
    .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupMessages.groupId))
    .where(eq(neighborGroupMessages.authorUserId, userId))
    .orderBy(asc(neighborGroupMessages.createdAt));
  const [postRows, replyRows, questionRows, searchRows, cannedRows] = await Promise.all([
    db.select().from(communityPosts).where(eq(communityPosts.authorUserId, userId)).orderBy(asc(communityPosts.createdAt)),
    db.select().from(communityReplies).where(eq(communityReplies.authorUserId, userId)).orderBy(asc(communityReplies.createdAt)),
    db.select({ question: taskQuestions, title: tasks.title }).from(taskQuestions).innerJoin(tasks, eq(tasks.id, taskQuestions.taskId)).where(eq(taskQuestions.askerUserId, userId)).orderBy(asc(taskQuestions.createdAt)),
    db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(asc(savedSearches.createdAt)),
    db.select().from(savedReplies).where(eq(savedReplies.userId, userId)).orderBy(asc(savedReplies.createdAt)),
  ]);

  // Added since 2026-11-22 (sweep 2026-11-24 A7): thank-you notes both ways, quiet hours, building and street groups,
  // family follows both ways, team-ups, neighborhood days, earlier wording of their edited posts and replies, and the
  // move that brought a welcome. Other people's words are masked as everywhere here.
  const [notesWritten, notesReceived, [quietRow], memberRows, followingRows, followerRows, teamRows, dayRows, editRows, [welcomeRow]] = await Promise.all([
    db.select().from(thankYouNotes).where(eq(thankYouNotes.authorUserId, userId)).orderBy(asc(thankYouNotes.createdAt)),
    db.select().from(thankYouNotes).where(eq(thankYouNotes.helperUserId, userId)).orderBy(asc(thankYouNotes.createdAt)),
    db.select().from(notificationQuietHours).where(eq(notificationQuietHours.userId, userId)).limit(1),
    db
      .select({ name: neighborGroups.name, kind: neighborGroups.kind, role: neighborGroupMembers.role, joinedAt: neighborGroupMembers.joinedAt, mutedAt: neighborGroupMembers.mutedAt })
      .from(neighborGroupMembers)
      .innerJoin(neighborGroups, eq(neighborGroups.id, neighborGroupMembers.groupId))
      .where(eq(neighborGroupMembers.userId, userId))
      .orderBy(asc(neighborGroupMembers.joinedAt)),
    db.select().from(bookingFollowers).where(eq(bookingFollowers.followerUserId, userId)).orderBy(asc(bookingFollowers.createdAt)),
    db.select().from(bookingFollowers).where(eq(bookingFollowers.addedByUserId, userId)).orderBy(asc(bookingFollowers.createdAt)),
    db.select().from(bookingTeams).where(or(eq(bookingTeams.leadUserId, userId), eq(bookingTeams.partnerUserId, userId), eq(bookingTeams.clientUserId, userId))).orderBy(asc(bookingTeams.createdAt)),
    db.select().from(neighborhoodDays).where(eq(neighborhoodDays.helperUserId, userId)).orderBy(asc(neighborhoodDays.day)),
    db.select().from(communityEdits).where(eq(communityEdits.editorUserId, userId)).orderBy(asc(communityEdits.createdAt)),
    db.select().from(communityWelcomes).where(eq(communityWelcomes.userId, userId)).limit(1),
  ]);
  const areaIds = [...new Set([user.homeAreaId, welcomeRow?.areaId, ...dayRows.map((row) => row.areaId)].filter((id): id is string => Boolean(id)))];
  const areaName = new Map(areaIds.length ? (await db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, areaIds))).map((row) => [row.id, row.name]) : []);
  const teamTaskIds = teamRows.map((row) => row.taskId).filter((id) => !titleOf.has(id));
  if (teamTaskIds.length) for (const row of await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, teamTaskIds))) titleOf.set(row.id, row.title);

  await nameOf([
    ...notesWritten.map((row) => row.helperUserId),
    ...notesReceived.map((row) => row.authorUserId),
    ...followingRows.map((row) => row.addedByUserId),
    ...followerRows.map((row) => row.followerUserId),
    ...teamRows.flatMap((row) => [row.clientUserId, row.leadUserId, row.partnerUserId]),
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
    about: t('about'),
    account: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.name,
      username: handle?.username ?? null,
      phone: user.phone,
      phoneVerifiedAt: iso(user.phoneVerifiedAt),
      mode: user.mode,
      language: user.locale,
      homeCity: homeMarket ? `${homeMarket.name}, ${homeMarket.state}` : null,
      status: user.status,
      createdAt: iso(user.createdAt),
      termsAcceptedAt: iso(user.termsAcceptedAt),
      termsVersion: user.termsVersion,
      adultAttestedAt: iso(user.adultAttestedAt),
      signInMethods: [{ method: t('emailCode'), since: iso(user.createdAt) }, ...signIns.filter((row) => row.provider !== 'credential').map((row) => ({ method: row.provider, since: iso(row.createdAt) }))],
      homeNeighborhood: user.homeAreaId ? (areaName.get(user.homeAreaId) ?? null) : null,
      // Their choices: who may message them, whether "Active today" shows, and what a helper profile shares.
      directMessages: user.directMessages,
      showActivity: user.showActivity,
      contactSharing: user.contactSharing,
    },
    quietHours: quietRow ? { enabled: quietRow.enabled, startsAt: quietRow.startsAt, endsAt: quietRow.endsAt, updatedAt: iso(quietRow.updatedAt) } : null,
    signedIn: sessionRows.map((row) => ({ browser: row.browser, ip: row.ip, since: iso(row.createdAt), until: iso(row.expiresAt) })),
    passkeys: passkeyRows.map((row) => ({ name: row.name, device: row.deviceType, backedUp: row.backedUp, addedAt: iso(row.createdAt) })),
    notificationDevices: pushRows.map((row) => ({ browser: row.browser, addedAt: iso(row.createdAt), lastSentAt: iso(row.lastSentAt) })),
    agreements: agreementRows.map((row) => ({ document: row.doc, version: row.version, acceptedAt: iso(row.acceptedAt), ip: row.ip, browser: row.userAgent })),
    notificationPreferences: preferenceRows.map((row) => ({ topic: row.topic, channel: row.channel, enabled: row.enabled === 'true' })),
    helperProfile: profile
      ? {
          handle: profile.handle,
          headline: profile.headline,
          bio: profile.bio,
          status: profile.status,
          area: profileArea?.name ?? null,
          homeZip: profile.homeZip,
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
    neighborhoodDays: dayRows.map((row) => ({ day: row.day, neighborhood: areaName.get(row.areaId) ?? null, category: categoryOf.get(row.categoryId) ?? row.categoryId, priceCents: row.priceCents, neighborPriceCents: row.neighborPriceCents, status: row.status, openedAt: iso(row.createdAt), canceledAt: iso(row.canceledAt) })),
    verification: {
      identity: identityRows.map((row) => ({ provider: row.provider, status: row.status, failureReason: row.failureReason, verifiedAt: iso(row.verifiedAt), startedAt: iso(row.createdAt) })),
      // Our own ID check (stage 1): what was sent and decided, never the photos or staff notes.
      identityPhotos: captureRows.map((row) => ({ documentType: row.documentType, status: row.status, rejectionReason: row.rejectionReason, submittedAt: iso(row.submittedAt), decidedAt: iso(row.decidedAt), photosDeletedAt: iso(row.filesDeletedAt) })),
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
    offersReceived: offersReceived.map((row) => ({ task: titleOf.get(row.taskId) ?? null, from: who(row.helperUserId), pricing: pricingOf(row), proposedStart: iso(row.proposedStart), message: hide(row.message), status: row.status, sentAt: iso(row.createdAt) })),
    offersMade: offersMade.map((row) => ({ task: titleOf.get(row.taskId) ?? null, pricing: pricingOf(row), proposedStart: iso(row.proposedStart), message: row.message, brings: row.brings, status: row.status, sentAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })),
    invites: inviteRows.map((row) => ({
      task: titleOf.get(row.taskId) ?? null,
      role: row.posterUserId === userId ? 'client' : 'helper',
      with: who(row.posterUserId === userId ? row.helperUserId : row.posterUserId),
      pricing: pricingOf(row),
      start: iso(row.startAt),
      message: row.posterUserId === userId ? row.message : hide(row.message),
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
    familyFollowing: followingRows.map((row) => ({ booking: row.bookingId, addedBy: who(row.addedByUserId), since: iso(row.createdAt), endedAt: iso(row.endedAt) })),
    familyFollowers: followerRows.map((row) => ({ booking: row.bookingId, follower: who(row.followerUserId), since: iso(row.createdAt), endedAt: iso(row.endedAt), endedBy: row.endedBy })),
    teamUps: teamRows.map((row) => ({
      task: titleOf.get(row.taskId) ?? null,
      role: row.leadUserId === userId ? 'lead' : row.partnerUserId === userId ? 'partner' : 'client',
      lead: who(row.leadUserId),
      partner: who(row.partnerUserId),
      client: who(row.clientUserId),
      pricing: pricingOf(row),
      note: row.leadUserId === userId ? row.note : hide(row.note),
      status: row.status,
      invitedAt: iso(row.createdAt),
      confirmedAt: iso(row.confirmedAt),
      closedAt: iso(row.closedAt),
    })),
    payments: paymentRows.map((row) => ({ booking: row.bookingId, purpose: row.purpose, amountCents: row.amountCents, status: row.status, card: row.methodLast4 ? (row.methodBrand ? t('card', { brand: row.methodBrand, last4: row.methodLast4 }) : t('cardWithoutBrand', { last4: row.methodLast4 })) : null, at: iso(row.createdAt) })),
    plans: planRows.map((row) => ({ plan: row.plan, interval: row.interval, priceCents: row.priceCents, status: row.status, periodEnd: iso(row.currentPeriodEnd), cancelAtPeriodEnd: row.cancelAtPeriodEnd, endedAt: iso(row.endedAt), at: iso(row.createdAt) })),
    // Sparks bought (2026-11-21); earned ones are counted from the posts, reactions, bookings and reviews above.
    sparkPurchases: sparkRows.map((row) => ({ pack: row.pack, points: row.points, amountCents: row.amountCents, status: row.status, at: iso(row.createdAt), paidAt: iso(row.paidAt) })),
    refunds: refundRows.map((row) => ({ booking: row.bookingId, amountCents: row.amountCents, reason: row.reason, status: row.status, at: iso(row.createdAt) })),
    paymentMethods: methodRows.map((row) => ({ brand: row.brand, last4: row.last4, expires: row.expMonth && row.expYear ? `${String(row.expMonth).padStart(2, '0')}/${row.expYear}` : null, default: row.isDefault, removedAt: iso(row.detachedAt), addedAt: iso(row.createdAt) })),
    earnings: earningRows.map((row) => ({ booking: row.bookingId, kind: row.kind, amountCents: row.amountCents, status: row.status, transferredAt: iso(row.transferredAt), at: iso(row.createdAt) })),
    // As the earnings page lists them (J-H19): an instant payout's fee and what reached the card.
    payouts: payoutRows.map((row) => ({ amountCents: row.amountCents, method: row.method, feeCents: row.feeCents, netCents: row.amountCents - row.feeCents, status: row.status, arrivalDate: row.arrivalDate, bankLast4: row.bankLast4, at: iso(row.createdAt) })),
    rewards: rewardRows.map((row) => ({ program: row.program, amountCents: row.amountCents, status: row.status, earnedAt: iso(row.createdAt), deliveredAt: iso(row.deliveredAt) })),
    reviewsWritten: reviewsWritten.map((row) => ({ about: who(row.subjectUserId), booking: row.bookingId, rating: row.rating, tags: row.tags, text: row.body, status: row.status, publishedAt: iso(row.publishedAt), writtenAt: iso(row.createdAt) })),
    reviewsAboutYou: reviewsAbout.map((row) => ({ from: who(row.authorUserId), booking: row.bookingId, rating: row.rating, tags: row.tags, text: hide(row.body), publishedAt: iso(row.publishedAt) })),
    thankYouNotesWritten: notesWritten.map((row) => ({ to: who(row.helperUserId), booking: row.bookingId, text: row.body, nameHidden: row.hideName, shownOnProfile: row.shownOnProfile, hiddenByUs: row.hiddenAt !== null, writtenAt: iso(row.createdAt) })),
    // A note our team hid isn't shown to the helper in the app either, so its words stay out here too.
    thankYouNotesReceived: notesReceived.map((row) => ({ from: who(row.authorUserId), booking: row.bookingId, text: row.hiddenAt ? null : hide(row.body), shownOnProfile: row.shownOnProfile && row.hiddenAt === null, receivedAt: iso(row.createdAt) })),
    savedHelpers: savedRows.map((row) => ({ helper: who(row.helperUserId), savedAt: iso(row.createdAt) })),
    blocked: blockRows.map((row) => ({ person: who(row.blockedId), since: iso(row.createdAt) })),
    messages: messageRows
      .filter((row) => row.body)
      .map((row) => ({ conversation: row.threadId, from: who(row.senderUserId), text: row.senderUserId === userId ? row.body : hide(row.body), at: iso(row.createdAt) })),
    supportCases: caseRows.map((row) => ({ id: row.id, type: row.type, topic: row.topic, status: row.status, reason: row.reason, description: row.description, openedAt: iso(row.createdAt), outcome: row.resolutionSummary, resolvedAt: iso(row.resolvedAt) })),
    notifications: notificationRows.map((row) => ({ type: row.type, about: row.title, at: iso(row.createdAt), readAt: iso(row.readAt) })),
    community: {
      posts: postRows.map((row) => ({ kind: row.kind, title: row.title, body: row.body, status: row.status, postedAt: iso(row.createdAt) })),
      replies: replyRows.map((row) => ({ body: row.body, status: row.status, repliedAt: iso(row.createdAt) })),
      groupMessages: groupMessageRows.map((row) => ({ group: row.group, body: row.body, status: row.status, sentAt: iso(row.createdAt) })),
      groups: memberRows.map((row) => ({ group: row.name, kind: row.kind, role: row.role, joinedAt: iso(row.joinedAt), mutedAt: iso(row.mutedAt) })),
      // What their posts and replies said before they edited them.
      earlierWording: editRows.map((row) => ({ kind: row.targetKind, title: row.title, body: row.body, replacedAt: iso(row.createdAt) })),
      welcome: welcomeRow ? { neighborhood: welcomeRow.areaId ? (areaName.get(welcomeRow.areaId) ?? null) : null, movedAt: iso(welcomeRow.movedAt), dismissedAt: iso(welcomeRow.dismissedAt) } : null,
    },
    taskQuestions: questionRows.map(({ question, title }) => ({ task: title, question: question.body, answer: question.answerBody, status: question.status, askedAt: iso(question.createdAt) })),
    savedSearches: searchRows.map((row) => ({ name: row.name, filters: row.params, alerts: row.alert, savedAt: iso(row.createdAt) })),
    savedReplies: cannedRows.map((row) => ({ title: row.title, body: row.body, savedAt: iso(row.createdAt) })),
  };
}
