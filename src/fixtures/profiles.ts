import { HELPER_CONTACT_EARNED_MIN, type HelperContactAccess, type HelperContactReveal, type HelperProfilePageData, type PublicReviewView } from '@/contracts';
import { jordan, lee, sam } from './people';

/** Public helper profiles (`/helpers/[handle]`). Images are placeholders in /public/samples. */

const samReviews: PublicReviewView[] = [
  {
    id: 'rev_1',
    rating: 5,
    tags: ['on_time', 'careful', 'tidy'],
    body: 'Sam had the bookshelf up in under an hour and took all the packaging with him.',
    author: { displayName: 'Maya R.', initials: 'MR' },
    categorySlug: 'furniture-assembly',
    publishedAt: '2026-11-08T22:00:00.000Z',
  },
  {
    id: 'rev_2',
    rating: 5,
    tags: ['friendly', 'skilled'],
    body: 'Moved a couch and a dresser down two flights without a scratch.',
    author: { displayName: 'Chris D.', initials: 'CD' },
    categorySlug: 'moving-help',
    publishedAt: '2026-10-30T18:30:00.000Z',
  },
  {
    id: 'rev_3',
    rating: 4,
    tags: ['good_value'],
    author: { displayName: 'Ana P.', initials: 'AP' },
    categorySlug: 'yard-cleanup',
    publishedAt: '2026-10-21T15:00:00.000Z',
  },
  {
    id: 'rev_4',
    rating: 5,
    tags: ['clear_communication', 'on_time'],
    body: 'Messaged when he was on his way and finished early. Would book again.',
    author: { displayName: 'Ruth A.', initials: 'RA' },
    categorySlug: 'furniture-assembly',
    publishedAt: '2026-10-02T20:00:00.000Z',
  },
];

export const samProfilePageData: HelperProfilePageData = {
  timeZone: 'America/Chicago',
  helper: sam,
  bio: 'I’ve been assembling furniture and helping neighbors move since 2024. I bring my own drill, bits, and moving straps, and I clean up when I’m done.',
  serviceRadiusMiles: 6,
  remoteOk: false,
  tools: ['Cordless drill', 'Hex and Torx bits', 'Moving straps', 'Furniture dolly'],
  languages: ['English', 'Spanish'],
  services: [
    { ...sam.services[0]!, description: 'Flat-pack desks, shelves, beds, and wardrobes. Wall anchoring on request.' },
    { ...sam.services[1]!, description: 'Loading, unloading, and moving within your home. No truck.' },
    { ...sam.services[2]!, description: 'Leaves, light pruning, and hauling bags to the curb.' },
    { ...sam.services[3]!, description: 'Kitchens, bathrooms, and a tidy-up before guests arrive.' },
  ],
  reviews: samReviews,
  workSamples: [
    {
      id: 'ws_1',
      photo: { id: 'ph_ws_1', src: '/samples/work-desk.svg', alt: 'An assembled desk with a monitor and drawer unit', width: 800, height: 600 },
      categorySlug: 'furniture-assembly',
      caption: 'Standing desk with a drawer unit',
    },
    {
      id: 'ws_2',
      photo: { id: 'ph_ws_2', src: '/samples/work-bookshelf.svg', alt: 'A tall bookshelf with books and plants', width: 800, height: 600 },
      categorySlug: 'furniture-assembly',
      caption: 'Five-shelf bookcase, anchored to the wall',
    },
    {
      id: 'ws_3',
      photo: { id: 'ph_ws_3', src: '/samples/work-yard.svg', alt: 'A tidy lawn with raked leaf piles', width: 800, height: 600 },
      categorySlug: 'yard-cleanup',
    },
  ],
};

/** Founding helper #63, verified but no completed tasks or reviews yet. */
export const jordanProfilePageData: HelperProfilePageData = {
  timeZone: 'America/Chicago',
  helper: jordan,
  bio: 'New to TasksNearMe and happy to help with furniture and moves around East Austin.',
  serviceRadiusMiles: 5,
  remoteOk: false,
  tools: ['Drill', 'Level'],
  languages: ['English'],
  services: jordan.services.map((service) => ({ ...service, description: '' })),
  reviews: [],
  workSamples: [],
};

/** Remote computer help, a few reviews, no work samples. */
export const leeProfilePageData: HelperProfilePageData = {
  timeZone: 'America/Chicago',
  helper: lee,
  bio: 'Patient help with new phones, printers, Wi-Fi, and backups, in person or over a screen share where you stay in control.',
  serviceRadiusMiles: 8,
  remoteOk: true,
  tools: [],
  languages: ['English', 'Vietnamese'],
  services: lee.services.map((service) => ({
    ...service,
    description:
      service.categorySlug === 'computer-help'
        ? 'Setup, fixes, and how-to help at your pace.'
        : 'Small flat-pack items: shelves, side tables, and chairs.',
  })),
  reviews: [
    {
      id: 'rev_9',
      rating: 5,
      tags: ['clear_communication', 'friendly'],
      body: 'Set up my new printer and wrote the steps down for me.',
      author: { displayName: 'Ruth A.', initials: 'RA' },
      categorySlug: 'computer-help',
      publishedAt: '2026-11-03T17:00:00.000Z',
    },
  ],
  workSamples: [],
};

/**
 * The contact panel on Jordan's profile (2026-11-24): Jordan shares their email and phone with neighbors who've earned
 * 2,000 Sparks. `helperContactRevealData`: the answer to "Show" (a fictional 555-01xx number).
 */
export const helperContactRevealAccess: HelperContactAccess = { state: 'reveal', shares: ['email', 'phone'] };
export const helperContactLockedAccess: HelperContactAccess = { state: 'locked', shares: ['email', 'phone'], earned: 212, at: HELPER_CONTACT_EARNED_MIN };
export const helperContactRevealData: HelperContactReveal = { ok: true, email: 'jordan@example.test', phone: '+15125550201' };
