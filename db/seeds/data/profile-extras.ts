/**
 * Helper profile content for development and e2e, mirroring src/fixtures/profiles.ts:
 * service descriptions, languages, work samples (placeholder images in /public/samples), and
 * published reviews. Rating averages and counts are recomputed from these reviews by the seed.
 */

export const SERVICE_DESCRIPTIONS: Record<string, string> = {
  'usr_sam:cat_furniture_assembly': 'Flat-pack desks, shelves, beds, and wardrobes. Wall anchoring on request.',
  'usr_sam:cat_moving_help': 'Loading, unloading, and moving within your home. No truck.',
  'usr_sam:cat_yard_cleanup': 'Leaves, light pruning, and bagging for curbside pickup.',
  'usr_sam:cat_light_cleaning': 'Kitchens, bathrooms, and a tidy-up before guests arrive.',
  'usr_lee:cat_furniture_assembly': 'Small flat-pack items: shelves, side tables, and chairs.',
  'usr_lee:cat_computer_help': 'Setup, fixes, and how-to help at your pace, in person or by screen share.',
  'usr_jordan:cat_furniture_assembly': 'Careful assembly of desks, beds, and shelves.',
  'usr_jordan:cat_moving_help': 'Loading and unloading. I bring straps and blankets.',
  'usr_jordan:cat_yard_cleanup': 'Raking and bagging leaves.',
};

export const HELPER_LANGUAGES: Record<string, string[]> = {
  usr_sam: ['en', 'es'],
  usr_lee: ['en', 'vi'],
  usr_jordan: ['en'],
};

export const WORK_SAMPLES = [
  {
    id: 'ws_sam_1',
    fileId: 'fil_ws_sam_1',
    userId: 'usr_sam',
    categoryId: 'cat_furniture_assembly',
    src: 'samples/work-desk.svg',
    alt: 'An assembled desk with a monitor and drawer unit',
    caption: 'Standing desk with a drawer unit',
  },
  {
    id: 'ws_sam_2',
    fileId: 'fil_ws_sam_2',
    userId: 'usr_sam',
    categoryId: 'cat_furniture_assembly',
    src: 'samples/work-bookshelf.svg',
    alt: 'A tall bookshelf with books and plants',
    caption: 'Five-shelf bookcase, anchored to the wall',
  },
  {
    id: 'ws_sam_3',
    fileId: 'fil_ws_sam_3',
    userId: 'usr_sam',
    categoryId: 'cat_yard_cleanup',
    src: 'samples/work-yard.svg',
    alt: 'A tidy lawn with raked leaf piles',
    caption: null,
  },
] as const;

export const SEED_REVIEWS = [
  {
    id: 'rev_seed_1',
    authorUserId: 'usr_maya',
    subjectUserId: 'usr_sam',
    categoryId: 'cat_furniture_assembly',
    rating: 5,
    tags: ['on_time', 'careful', 'tidy'],
    body: 'Sam had the bookshelf up in under an hour and took all the packaging with him.',
    publishedAt: '2026-11-08T22:00:00.000Z',
  },
  {
    id: 'rev_seed_2',
    authorUserId: 'usr_chris',
    subjectUserId: 'usr_sam',
    categoryId: 'cat_moving_help',
    rating: 5,
    tags: ['friendly', 'skilled'],
    body: 'Moved a couch and a dresser down two flights without a scratch.',
    publishedAt: '2026-10-30T18:30:00.000Z',
  },
  {
    id: 'rev_seed_3',
    authorUserId: 'usr_ana',
    subjectUserId: 'usr_sam',
    categoryId: 'cat_yard_cleanup',
    rating: 4,
    tags: ['good_value'],
    body: null,
    publishedAt: '2026-10-21T15:00:00.000Z',
  },
  {
    id: 'rev_seed_4',
    authorUserId: 'usr_ruth',
    subjectUserId: 'usr_sam',
    categoryId: 'cat_furniture_assembly',
    rating: 5,
    tags: ['clear_communication', 'on_time'],
    body: 'Messaged when he was on his way and finished early. Would book again.',
    publishedAt: '2026-10-02T20:00:00.000Z',
  },
  {
    id: 'rev_seed_5',
    authorUserId: 'usr_ruth',
    subjectUserId: 'usr_lee',
    categoryId: 'cat_computer_help',
    rating: 5,
    tags: ['clear_communication', 'friendly'],
    body: 'Set up my new printer and wrote the steps down for me.',
    publishedAt: '2026-11-03T17:00:00.000Z',
  },
] as const;
