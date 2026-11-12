/**
 * Distance on the map, for the browser and the server alike. The landing page compares a visitor's own
 * location (which never leaves their browser) with tasks' public points to sort and label what's near them.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.7613;

/** Great-circle distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounded for display: "0.4 mi" under a mile, whole miles above ("3 mi"). */
export function roundMiles(miles: number): number {
  return miles < 1 ? Math.max(0.1, Math.round(miles * 10) / 10) : Math.round(miles);
}
