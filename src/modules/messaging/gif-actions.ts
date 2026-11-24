'use server';

import { cookies } from 'next/headers';
import type { AttachGifInput, GifSearchInput, GifSearchResult, PhotoUploadResult } from '@/contracts';
import { GIF_STAND_IN_COOKIE, createGifProvider, wantsGifStandIn } from '@/integrations/gifs';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { attachGif, searchGifs } from './gifs';

/**
 * Server Actions behind the composer's GIFs (2026-11-24; ThreadHandlers.onSearchGifs and onAttachGif, on the
 * conversation page and in the chat window). Neither refreshes anything: the picked GIF goes with the composer's Send.
 */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** KLIPY, or the samples: development and tests ask for them with the `tnm_gif_stand_in` cookie (never in production). */
async function gifProvider() {
  return createGifProvider(process.env, { standIn: wantsGifStandIn((await cookies()).get(GIF_STAND_IN_COOKIE)?.value) });
}

export async function searchGifsAction(input: GifSearchInput): Promise<GifSearchResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unavailable' };
  return searchGifs(db, userId, input, await requestNow(), await gifProvider());
}

export async function attachGifAction(input: AttachGifInput): Promise<PhotoUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  return attachGif({ db, storage: fileStorage }, { userId, id: input?.id }, await gifProvider());
}
