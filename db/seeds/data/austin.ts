/** Austin market seed data. Area centers are approximate neighborhood centers. */

export const AUSTIN = {
  id: 'mkt_austin',
  slug: 'austin',
  name: 'Austin',
  state: 'TX',
  timeZone: 'America/Chicago',
  currency: 'USD',
  // A later city since 2026-11-17 (owner: Gainesville, FL is the first): paused, so its pages 404 and Austin ZIPs wait.
  // The test world (seedDatabase's testWorld) reopens it for the e2e and integration cast, who live here.
  status: 'paused',
  centerLat: 30.2672,
  centerLng: -97.7431,
  serviceRadiusKm: 25,
} as const;

/** The ZIP3 prefixes Austin covers: 787 is the city, 786 the towns around it (Round Rock, Pflugerville, Kyle). */
export const AUSTIN_ZIP_PREFIXES: string[] = ['786', '787'];

export const AUSTIN_AREAS: Array<{ slug: string; name: string; lat: number; lng: number }> = [
  { slug: 'downtown', name: 'Downtown', lat: 30.2672, lng: -97.7431 },
  { slug: 'mueller', name: 'Mueller', lat: 30.2993, lng: -97.7036 },
  { slug: 'east-austin', name: 'East Austin', lat: 30.262, lng: -97.721 },
  { slug: 'hyde-park', name: 'Hyde Park', lat: 30.306, lng: -97.727 },
  { slug: 'windsor-park', name: 'Windsor Park', lat: 30.311, lng: -97.693 },
  { slug: 'cherrywood', name: 'Cherrywood', lat: 30.287, lng: -97.713 },
  { slug: 'north-loop', name: 'North Loop', lat: 30.318, lng: -97.72 },
  { slug: 'allandale', name: 'Allandale', lat: 30.339, lng: -97.748 },
  { slug: 'crestview', name: 'Crestview', lat: 30.346, lng: -97.723 },
  { slug: 'travis-heights', name: 'Travis Heights', lat: 30.247, lng: -97.746 },
  { slug: 'zilker', name: 'Zilker', lat: 30.26, lng: -97.769 },
  { slug: 'circle-c', name: 'Circle C', lat: 30.186, lng: -97.885 },
];

export const CATEGORIES = [
  {
    id: 'cat_furniture_assembly',
    slug: 'furniture-assembly',
    name: 'Furniture assembly',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    minHours: null,
    requiredEvidence: { photosMin: 1, hours: false, receipts: true, remoteNote: false },
    prohibitedKeywords: ['electrical', 'wiring', 'gas line', 'plumbing', 'light fixture'],
    sortOrder: 1,
    guidance: { lowCents: 5000, highCents: 8000, unit: 'item' as const },
  },
  {
    id: 'cat_moving_help',
    slug: 'moving-help',
    name: 'Moving help',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'hourly',
    minPriceCents: 3500,
    minHours: 2,
    requiredEvidence: { photosMin: 0, hours: true, receipts: false, remoteNote: false },
    // Labor only: loading or unloading a rented truck is fine; transport in the helper's vehicle isn't (blueprint 01 §6.1).
    prohibitedKeywords: ['piano', 'gun safe', 'your truck', 'your vehicle', 'your van', 'drive the truck', 'hazardous'],
    sortOrder: 2,
    guidance: { lowCents: 3200, highCents: 4000, unit: 'hour' as const },
  },
  {
    id: 'cat_yard_cleanup',
    slug: 'yard-cleanup',
    name: 'Yard cleanup',
    inHome: false,
    remoteAllowed: false,
    requiresBackgroundCheck: false,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    minHours: null,
    requiredEvidence: { photosMin: 1, hours: false, receipts: true, remoteNote: false },
    prohibitedKeywords: ['pesticide', 'herbicide', 'weed killer', 'irrigation', 'chainsaw', 'tree removal', 'ladder', 'haul away'],
    sortOrder: 3,
    guidance: { lowCents: 6000, highCents: 14000, unit: 'task' as const },
  },
  {
    id: 'cat_light_cleaning',
    slug: 'light-cleaning',
    name: 'Light cleaning',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 6000,
    minHours: null,
    requiredEvidence: { photosMin: 1, hours: false, receipts: false, remoteNote: false },
    prohibitedKeywords: ['mold', 'biohazard', 'post-construction'],
    sortOrder: 4,
    guidance: { lowCents: 9000, highCents: 16000, unit: 'task' as const },
  },
  {
    id: 'cat_computer_help',
    slug: 'computer-help',
    name: 'Computer and phone help',
    inHome: true, // in-person visits; remote sessions don't need a background check
    remoteAllowed: true,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    minHours: null,
    requiredEvidence: { photosMin: 0, hours: false, receipts: false, remoteNote: true },
    prohibitedKeywords: ['crypto wallet', 'bank login', 'password'],
    sortOrder: 5,
    guidance: { lowCents: 3500, highCents: 7000, unit: 'task' as const },
  },
];
