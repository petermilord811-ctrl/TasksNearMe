'use server';

import { cookies } from 'next/headers';
import type { LandingCityResult } from '@/contracts';
import { LANDING_CITY_COOKIE, LANDING_CITY_COOKIE_OPTIONS, validMarketSlug } from '@/modules/markets/default-market';
import { requestRows } from '@/platform/auth/audience';
import { getLandingCity } from './queries';

/**
 * The landing map's city switcher (`LandingHandlers.onLoadCity`; owner, 2026-11-23: "This platform is not for only
 * Gainesville"): one city's market and map, drawn for this visitor as the landing draws it (the demo marketplace's
 * cities only for signed-in testers), from the same cache. A city the visitor picked is remembered in a cookie holding
 * its slug, so the landing opens on it next time; setting it also draws the page again for that city (Next re-renders
 * the page when an action sets a cookie), so the hero and the sections below follow the pick. The visitor's location
 * never reaches this action: their device works out which city it falls in and asks for that city by name.
 */
export async function loadLandingCity(input: { slug: string; remember: boolean }): Promise<LandingCityResult> {
  const slug = typeof input?.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  if (!validMarketSlug(slug)) return { ok: false, code: 'not_found' };
  try {
    const city = await getLandingCity(slug, await requestRows());
    if (!city) return { ok: false, code: 'not_found' };
    if (input.remember === true) (await cookies()).set(LANDING_CITY_COOKIE, slug, LANDING_CITY_COOKIE_OPTIONS);
    return { ok: true, city };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
