import 'server-only';
import { devHelpersOn } from '@/shared/dev-helpers';
import { createKlipyGifs } from './klipy';
import { createStandInGifs } from './stand-in';
import type { GifProvider } from './types';

/**
 * GIFs in chat (2026-11-24): KLIPY with `KLIPY_API_KEY`; without it, development and tests use the stand-in's samples
 * and production has no GIFs (no GIF button). Tests never reach KLIPY, even where a key is set: a browser with the
 * `tnm_gif_stand_in=1` cookie gets the samples (never in production), like the AI stand-ins' cookie.
 */
export const GIF_STAND_IN_COOKIE = 'tnm_gif_stand_in';

export function wantsGifStandIn(cookieValue: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return devHelpersOn(env) && cookieValue === '1';
}

/** Whether the composer offers GIFs here: a KLIPY key, or the samples outside production. */
export function gifsOn(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.KLIPY_API_KEY?.trim()) || devHelpersOn(env);
}

// One KLIPY client per key, so its short cache of pages is shared by everyone.
let klipy: { key: string; provider: GifProvider } | null = null;
let standIn: GifProvider | null = null;

export function createGifProvider(env: Record<string, string | undefined> = process.env, options: { standIn?: boolean } = {}): GifProvider | null {
  const key = env.KLIPY_API_KEY?.trim();
  if (key && !(options.standIn && devHelpersOn(env))) {
    if (klipy?.key !== key) klipy = { key, provider: createKlipyGifs(key) };
    return klipy.provider;
  }
  if (!devHelpersOn(env)) return null;
  standIn ??= createStandInGifs();
  return standIn;
}

export { GifTooLargeError, GifUnavailableError, type GifMedia, type GifPage, type GifProvider } from './types';
