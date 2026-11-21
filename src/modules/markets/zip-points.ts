import type { LatLng } from './geo';

/**
 * A US ZIP code's center, from the US Census Bureau's ZIP code areas (zip-points.data.ts, public data), for places
 * outside a market's service area (owner, 2026-11-21: tasks can be posted anywhere). Nothing here comes from a
 * geocoder, so it can be stored and shown: Mapbox's terms forbid keeping its coordinates (decisions.md, 2026-11-12).
 * A ZIP with no area of its own (a PO box, a new ZIP) takes the nearest ZIP with the same first three digits; null
 * when there's none.
 */

interface ZipTable {
  points: Map<string, LatLng>;
  /** ZIPs by their first three digits, in order. */
  byPrefix: Map<string, string[]>;
}

let loading: Promise<ZipTable> | null = null;

function parse(source: string): ZipTable {
  const points = new Map<string, LatLng>();
  const byPrefix = new Map<string, string[]>();
  for (const entry of source.split(',')) {
    const [zip, lat, lng] = entry.split(':');
    if (!zip || lat === undefined || lng === undefined) continue;
    points.set(zip, { lat: Number(lat) / 100, lng: Number(lng) / 100 });
    const prefix = zip.slice(0, 3);
    const list = byPrefix.get(prefix);
    if (list) list.push(zip);
    else byPrefix.set(prefix, [zip]);
  }
  return { points, byPrefix };
}

/** The table is about 0.6 MB of text: loaded the first time an address outside a market needs it. */
function table(): Promise<ZipTable> {
  loading ??= import('./zip-points.data').then(({ ZIP_POINTS }) => parse(ZIP_POINTS));
  return loading;
}

export function zipPointIn(zips: ZipTable, zip: string): LatLng | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const exact = zips.points.get(zip);
  if (exact) return exact;
  const neighbors = zips.byPrefix.get(zip.slice(0, 3));
  if (!neighbors?.length) return null;
  const wanted = Number(zip);
  const nearest = neighbors.reduce((best, candidate) => (Math.abs(Number(candidate) - wanted) < Math.abs(Number(best) - wanted) ? candidate : best));
  return zips.points.get(nearest) ?? null;
}

export async function zipPoint(zip: string): Promise<LatLng | null> {
  return zipPointIn(await table(), zip.trim().slice(0, 5));
}

/** For tests: a table from a few entries, in the data file's format. */
export function zipTableOf(source: string): ZipTable {
  return parse(source);
}
