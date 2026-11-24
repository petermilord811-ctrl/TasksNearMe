'use server';

import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type {
  ActionResult,
  AnnouncementEndInput,
  AnnouncementInput,
  CommunityAreaInput,
  CommunityEditInput,
  CommunityFollowInput,
  CommunityModerationInput,
  CommunityPostInput,
  CommunityReactInput,
  CommunityReactorsView,
  CommunityReplyInput,
  CommunityTranslation,
  PhotoUploadResult,
  PortalMore,
  PortalQuery,
} from '@/contracts';
import { localeOrDefault, routes } from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeTranslator } from '@/integrations/ai/translator';
import { storePhoto } from '@/modules/files/uploads';
import { staffActorOf } from '@/modules/support/staff';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { dismissAnnouncement, endAnnouncement, publishAnnouncement } from './announcements';
import { COMMUNITY_PHOTO_KIND } from './photos';
import { getPortalMore, visibleFreshKeys } from './portal';
import { communityViewerOf } from './request-viewer';
import { NEIGHBORS_SAMPLES_COOKIE } from './samples';
import { dismissWelcome } from './welcome';
import {
  createCommunityPost,
  deleteOwnCommunityItem,
  editCommunityItem,
  followCommunityPost,
  moderateCommunityItem,
  pinCommunityAnswer,
  reactInCommunity,
  reactorsOf,
  replyToCommunityPost,
  saveCommunityPost,
  setCommunityArea,
  type CommunityViewer,
} from './service';
import { translateCommunityItem } from './translate';

/** Server Actions behind the community pages (src/contracts/community.ts). */

async function communityViewer(): Promise<CommunityViewer | null> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return null;
  return communityViewerOf(viewer.user, localeOrDefault(await getLocale().catch(() => undefined)));
}

/**
 * The portal's next page for "Show more" (plan 9.10): the same filters read the way the page reads them (the
 * viewer's market and place, blocks both ways), parsed like the address's, so nothing sent here widens what they see.
 */
export async function loadPortalPageAction(query: PortalQuery & { page: number }): Promise<PortalMore | null> {
  const viewer = await communityViewer();
  if (!viewer) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  // Whole dollars only; anything else is dropped (the address's parser checks the range again).
  const dollars = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined);
  const slots = Array.isArray(query?.slots) ? query.slots.filter((slot): slot is NonNullable<PortalQuery['slots']>[number] => typeof slot === 'string') : undefined;
  return getPortalMore(
    db,
    viewer,
    {
      area: text(query?.area),
      category: text(query?.category) as PortalQuery['category'],
      type: text(query?.type) as PortalQuery['type'],
      time: text(query?.time) as PortalQuery['time'],
      q: text(query?.q),
      saved: query?.saved === true,
      unanswered: query?.unanswered === true,
      // Open tasks' own filters (2026-11-23).
      minPrice: dollars(query?.minPrice),
      maxPrice: dollars(query?.maxPrice),
      pricing: text(query?.pricing) as PortalQuery['pricing'],
      when: text(query?.when) as PortalQuery['when'],
      ...(slots ? { slots } : {}),
      few: query?.few === true,
      sort: text(query?.sort) as PortalQuery['sort'],
      view: text(query?.view) as PortalQuery['view'],
      group: text(query?.group) as PortalQuery['group'],
      page: Number(query?.page) || 1,
    },
    await requestNow(),
  );
}

/**
 * The portal's "N new · Show" pill (sweep P5): of the new items it heard about, the ones this viewer would see (not
 * their own, not from someone blocked either way, still up).
 */
export async function portalFreshAction(keys: string[]): Promise<string[]> {
  const viewer = await communityViewer();
  if (!viewer || !Array.isArray(keys)) return [];
  return visibleFreshKeys(db, viewer.id, keys, viewer.rows ?? 'all');
}

/** Keeps a post in the viewer's Saved, or takes it out (plan 9.10). */
export async function saveCommunityPostAction(input: { postId: string; saved: boolean }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await saveCommunityPost(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function createCommunityPostAction(input: CommunityPostInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return createCommunityPost(db, viewer, input, await requestNow());
}

/** A photo for a post or a reply (plan 10.1): re-encoded, location data and all other metadata removed. */
export async function uploadCommunityPhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'unknown' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  return storePhoto({ db, storage: fileStorage }, { userId: viewer.id, kind: COMMUNITY_PHOTO_KIND, file });
}

/**
 * A reply to a post: the page binds it (`replyToCommunityPostAction.bind(null, postId)`), and the portal's cards call it
 * with the post named (plan 10.3).
 */
export async function replyToCommunityPostAction(postId: string, input: CommunityReplyInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await replyToCommunityPost(db, viewer, String(postId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function reactInCommunityAction(input: CommunityReactInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await reactInCommunity(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Bound to the post: `pinCommunityAnswerAction.bind(null, postId)`. */
export async function pinCommunityAnswerAction(postId: string, input: { replyId: string | null }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await pinCommunityAnswer(db, viewer, String(postId), input.replyId === null ? null : String(input.replyId), await requestNow());
  if (result.ok) refresh();
  return result;
}

async function deleteOwn(input: { target: 'post' | 'reply'; id: string }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return deleteOwnCommunityItem(db, viewer, input.target === 'post' ? 'post' : 'reply', String(input.id), await requestNow());
}

/** A feed's Delete (2026-11-23): the post or reply goes and the feed stays where it was, filters and scroll included. */
export async function deleteOwnCommunityItemAction(input: { target: 'post' | 'reply'; id: string }): Promise<ActionResult> {
  const result = await deleteOwn(input);
  if (result.ok) refresh();
  return result;
}

/** The post page's Delete: its post gone, back to the feed; a reply goes and the page stays. */
export async function deleteFromPostPageAction(input: { target: 'post' | 'reply'; id: string }): Promise<ActionResult> {
  const result = await deleteOwn(input);
  if (!result.ok) return result;
  if (input.target === 'post') return { ...result, redirectTo: routes.app.community() };
  refresh();
  return result;
}

/** The author edits their post or reply (plan 10.5). */
export async function editCommunityItemAction(input: CommunityEditInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await editCommunityItem(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Follow a post, mute it, or neither (plan 10.9). */
export async function followCommunityPostAction(input: CommunityFollowInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await followCommunityPost(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Who found a post or reply helpful, and who said thanks (plan 10.2). */
export async function loadCommunityReactorsAction(input: { target: 'post' | 'reply'; id: string }): Promise<CommunityReactorsView | null> {
  const viewer = await communityViewer();
  if (!viewer) return null;
  return reactorsOf(db, viewer, { target: input?.target === 'reply' ? 'reply' : 'post', id: String(input?.id ?? '') });
}

/** A post or reply in the viewer's language, on request (plan 10.23). */
export async function translateCommunityItemAction(input: { target: 'post' | 'reply'; id: string }): Promise<CommunityTranslation | null> {
  const viewer = await communityViewer();
  if (!viewer) return null;
  // Tests ask for the stand-in with the AI cookie (never in production), as the other AI features do.
  const standIn = wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
  return translateCommunityItem(db, viewer, { target: input?.target === 'reply' ? 'reply' : 'post', id: String(input?.id ?? '') }, await requestNow(), standIn ? createFakeTranslator() : undefined);
}

/** The viewer's neighborhood on Neighbors (plan 10.15). */
export async function setCommunityAreaAction(input: CommunityAreaInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await setCommunityArea(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Close the pinned card for good (plan 10.16). */
export async function dismissAnnouncementAction(input: { id: string }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await dismissAnnouncement(db, viewer.id, String(input?.id ?? ''), await requestNow());
  if (result.ok) refresh();
  return result;
}

/** "Got it" on the welcome for new movers (2026-11-24): closed for good, on every device. */
export async function dismissWelcomeAction(input: { id: string }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await dismissWelcome(db, viewer, { id: String(input?.id ?? '') }, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Staff in production: show or hide the demo marketplace on Neighbors for themselves (plan 10, D1). */
export async function setNeighborsSamplesAction(input: { shown: boolean }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || !staffActorOf(viewer.user)) return { ok: false, code: 'not_allowed' };
  const store = await cookies();
  if (input?.shown === true) store.set(NEIGHBORS_SAMPLES_COOKIE, '1', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
  else store.delete(NEIGHBORS_SAMPLES_COOKIE);
  refresh();
  return { ok: true, code: 'updated' };
}

export async function moderateCommunityItemAction(input: { target: 'post' | 'reply'; id: string } & CommunityModerationInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer?.staff) return { ok: false, code: 'not_allowed' };
  const { target, id, ...moderation } = input;
  const result = await moderateCommunityItem(db, viewer.staff, target === 'post' ? 'post' : 'reply', String(id), moderation, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Admins pin a card to a market's Neighbors (plan 10.16; the config page). */
export async function publishAnnouncementAction(input: AnnouncementInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await publishAnnouncement(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Admins take a card down now. */
export async function endAnnouncementAction(input: AnnouncementEndInput): Promise<ActionResult> {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await endAnnouncement(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
