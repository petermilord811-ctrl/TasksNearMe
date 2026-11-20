/**
 * US ZIP codes without a lookup service (owner, 2026-11-14: national, cities open in turn). The first three
 * digits of a ZIP (its "ZIP3" prefix, a USPS sectional center) name a state, so a ZIP alone tells us the state
 * and which nearby ZIPs share a sectional center. That is enough to group waitlist demand and to tell whether a
 * ZIP falls in one of our markets (each market lists its ZIP3 prefixes, `markets.zip_prefixes`).
 *
 * Nothing here comes from a geocoder: Mapbox's terms forbid storing its results, and a ZIP's state is public
 * USPS data. Military (AA/AE/AP) prefixes aren't served and read as no state.
 */

/** The 50 states, DC and the territories USPS gives ZIP codes. */
export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR', 'VI', 'GU',
] as const;
export type UsStateCode = (typeof US_STATE_CODES)[number];

/**
 * ZIP3 ranges (inclusive) and their state, in order. Prefixes inside a range that USPS doesn't use read as that
 * state too, which is harmless: such a ZIP can't be real, and nothing is ever delivered to it.
 */
const RANGES: ReadonlyArray<readonly [number, number, UsStateCode]> = [
  [5, 5, 'NY'],
  [6, 7, 'PR'],
  [8, 8, 'VI'],
  [9, 9, 'PR'],
  [10, 27, 'MA'],
  [28, 29, 'RI'],
  [30, 38, 'NH'],
  [39, 49, 'ME'],
  [50, 54, 'VT'],
  [55, 55, 'MA'],
  [56, 59, 'VT'],
  [60, 69, 'CT'],
  [70, 89, 'NJ'],
  // 090–099: military mail (AE).
  [100, 149, 'NY'],
  [150, 196, 'PA'],
  [197, 199, 'DE'],
  [200, 200, 'DC'],
  [201, 201, 'VA'],
  [202, 205, 'DC'],
  [206, 219, 'MD'],
  [220, 246, 'VA'],
  [247, 268, 'WV'],
  [270, 289, 'NC'],
  [290, 299, 'SC'],
  [300, 319, 'GA'],
  [320, 339, 'FL'],
  // 340: military mail (AA).
  [341, 349, 'FL'],
  [350, 369, 'AL'],
  [370, 385, 'TN'],
  [386, 397, 'MS'],
  [398, 399, 'GA'],
  [400, 427, 'KY'],
  [430, 459, 'OH'],
  [460, 479, 'IN'],
  [480, 499, 'MI'],
  [500, 528, 'IA'],
  [530, 549, 'WI'],
  [550, 567, 'MN'],
  [569, 569, 'DC'],
  [570, 577, 'SD'],
  [580, 588, 'ND'],
  [590, 599, 'MT'],
  [600, 629, 'IL'],
  [630, 658, 'MO'],
  [660, 679, 'KS'],
  [680, 693, 'NE'],
  [700, 715, 'LA'],
  [716, 729, 'AR'],
  [730, 732, 'OK'],
  [733, 733, 'TX'],
  [734, 749, 'OK'],
  [750, 799, 'TX'],
  [800, 816, 'CO'],
  [820, 831, 'WY'],
  [832, 838, 'ID'],
  [840, 847, 'UT'],
  [850, 865, 'AZ'],
  [870, 884, 'NM'],
  [885, 885, 'TX'],
  [889, 898, 'NV'],
  [900, 961, 'CA'],
  // 962–966: military mail (AP).
  [967, 968, 'HI'],
  [969, 969, 'GU'],
  [970, 979, 'OR'],
  [980, 994, 'WA'],
  [995, 999, 'AK'],
];

/** A five-digit ZIP ("78723"); ZIP+4 ("78723-1234") is cut to its first five digits. */
export function normalizeZip(input: string): string | null {
  const match = /^\s*(\d{5})(?:-?\d{4})?\s*$/.exec(input);
  return match ? match[1]! : null;
}

/** "78723" → "787". */
export function zip3Of(zip: string): string | null {
  const five = normalizeZip(zip);
  return five ? five.slice(0, 3) : null;
}

/** The state a ZIP belongs to, or null when it isn't a ZIP we can serve (not five digits, military mail). */
export function stateOfZip(zip: string): UsStateCode | null {
  const prefix = zip3Of(zip);
  if (!prefix) return null;
  const value = Number(prefix);
  for (const [from, to, state] of RANGES) {
    if (value < from) return null;
    if (value <= to) return state;
  }
  return null;
}

/**
 * A city name as people type it, tidied for showing: single spaces, a trailing state code (", TX" or " TX")
 * dropped, and title case when it was typed all in one case ("  san   antonio, tx " → "San Antonio"; "McAllen"
 * stays as typed). Too short or too long → null.
 */
export function tidyCityName(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let city = input.replace(/\s+/g, ' ').trim();
  const suffix = /,?\s+([A-Za-z]{2})$/.exec(city);
  if (suffix && (US_STATE_CODES as readonly string[]).includes(suffix[1]!.toUpperCase())) city = city.slice(0, suffix.index).trim();
  city = city.replace(/,$/, '').trim();
  if (city.length < 2 || city.length > 60) return null;
  // A city is shown on public pages (the waitlist's demand): nothing that reads as a number, an address or a link
  // (security review 2026-11-20).
  if (/[\d@/:\\]/.test(city) || /\.(?:com|net|org|io|co|me|app)\b/i.test(city)) return null;
  if (city === city.toLowerCase() || city === city.toUpperCase()) {
    city = city.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
  }
  return city;
}

/** The key two spellings of one city share ("San antonio" and "SAN ANTONIO, TX" → "san antonio"). */
export function cityKey(input: string | null | undefined): string | null {
  return tidyCityName(input)?.toLowerCase() ?? null;
}
