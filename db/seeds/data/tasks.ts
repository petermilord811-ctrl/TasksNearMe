/**
 * Open tasks for development and e2e, mirroring the public task fixtures (src/fixtures/marketing.ts).
 * Windows are relative to the day the seed runs (market time), so the board always has upcoming work.
 */
export interface SeedTask {
  id: string;
  slug: string;
  posterId: string;
  categoryId: string;
  title: string;
  description: string;
  details: Record<string, string | number | boolean>;
  /** Fictional address (src/integrations/geocoding FAKE_PLACES); absent for remote tasks. */
  placeId?: string;
  unit?: string;
  accessNotes?: string;
  daysFromToday: number;
  /** Market-local "HH:MM"; absent when flexible. */
  start?: string;
  end?: string;
  budget: { type: 'fixed'; priceCents: number } | { type: 'hourly'; rateCents: number; estimatedHours: number; hoursCap: number };
  offerCount: number;
  postedHoursAgo: number;
}

export const SEED_TASKS: SeedTask[] = [
  {
    id: 'tsk_desk',
    slug: 'assemble-a-desk-mueller-7f3k',
    posterId: 'usr_maya',
    categoryId: 'cat_furniture_assembly',
    title: 'Assemble a desk (flat-pack, 1 item)',
    description: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
    details: { itemType: 'desk', itemCount: 1, floor: 2, elevator: true, toolsOnSite: false },
    placeId: 'plc_mueller_1234',
    unit: 'Apt 2B',
    accessNotes: 'Buzz 2B. Elevator is on the left.',
    daysFromToday: 4,
    start: '10:00',
    end: '13:00',
    budget: { type: 'fixed', priceCents: 6000 },
    offerCount: 3,
    postedHoursAgo: 13,
  },
  {
    id: 'tsk_yard',
    slug: 'rake-and-bag-front-yard-leaves-crestview-2m9q',
    posterId: 'usr_ben',
    categoryId: 'cat_yard_cleanup',
    title: 'Rake and bag front-yard leaves',
    description: 'Medium front yard, mostly oak leaves. Bags provided; the city picks them up at the curb.',
    details: { yardSize: 'medium', work: 'leaves', greenWastePlan: 'curbside', toolsOnSite: true },
    placeId: 'plc_crestview_88',
    daysFromToday: 6,
    start: '09:00',
    end: '12:00',
    budget: { type: 'fixed', priceCents: 12000 },
    offerCount: 1,
    postedHoursAgo: 50,
  },
  {
    id: 'tsk_cleaning',
    slug: 'light-cleaning-2-bedroom-hyde-park-8x1d',
    posterId: 'usr_ana',
    categoryId: 'cat_light_cleaning',
    title: 'Light cleaning for a 2-bedroom apartment',
    description: 'Kitchen, bathroom, floors and a quick dust. Supplies are under the sink. One friendly cat.',
    details: { bedrooms: 2, bathrooms: 1, suppliesOnSite: true, pets: true },
    placeId: 'plc_hydepark_402',
    daysFromToday: 8,
    budget: { type: 'fixed', priceCents: 11000 },
    offerCount: 0,
    postedHoursAgo: 21,
  },
  {
    // Kept free of offers for the helper e2e (a fresh offer is sent and withdrawn each run).
    id: 'tsk_shelves',
    slug: 'mount-two-floating-shelves-windsor-park-5p2c',
    posterId: 'usr_ana',
    categoryId: 'cat_furniture_assembly',
    title: 'Mount two floating shelves',
    description: 'Two 36-inch floating shelves for the living room wall. Brackets and screws are in the box; the wall is drywall.',
    details: { itemType: 'other', itemCount: 2, wallAnchoring: true, toolsOnSite: false },
    placeId: 'plc_windsor_300',
    daysFromToday: 5,
    start: '13:00',
    end: '16:00',
    budget: { type: 'fixed', priceCents: 5000 },
    offerCount: 0,
    postedHoursAgo: 30,
  },
  {
    // Chris books Jordan's hourly offer in the booking e2e (the e2e setup removes its bookings each run).
    id: 'tsk_moving',
    slug: 'help-loading-a-moving-truck-crestview-9d2a',
    posterId: 'usr_chris',
    categoryId: 'cat_moving_help',
    title: 'Help loading a moving truck',
    description: 'Two-bedroom apartment, boxes are packed. Couch, dresser, and a queen bed. Truck is rented.',
    details: { moveType: 'load_truck', rooms: 2, heavyItems: 'Couch, dresser, queen bed', stairFlights: 1, elevator: false },
    placeId: 'plc_crestview_88',
    daysFromToday: 7,
    start: '09:00',
    end: '13:00',
    budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
    offerCount: 1,
    postedHoursAgo: 40,
  },
  {
    // Booked with Jordan by the seed (a confirmed booking for the booking-page e2e; read-only there).
    id: 'tsk_tv',
    slug: 'mount-a-tv-on-the-wall-crestview-6t1v',
    posterId: 'usr_ben',
    categoryId: 'cat_furniture_assembly',
    title: 'Mount a TV on the wall',
    description: 'A 55-inch TV and its wall bracket, already unboxed. Drywall with studs; I have a stud finder.',
    details: { itemType: 'other', itemCount: 1, wallAnchoring: true, toolsOnSite: true },
    placeId: 'plc_crestview_88',
    unit: 'Unit 4',
    accessNotes: 'Side gate is unlocked.',
    daysFromToday: 3,
    start: '14:00',
    end: '17:00',
    budget: { type: 'fixed', priceCents: 8000 },
    offerCount: 0,
    postedHoursAgo: 60,
  },
  {
    id: 'tsk_computer',
    slug: 'set-up-a-new-laptop-remote-4k7w',
    posterId: 'usr_ruth',
    categoryId: 'cat_computer_help',
    title: 'Set up a new laptop and move my photos',
    description: 'New Windows laptop. I need my photos moved from the old one and email set up. Happy to share my screen.',
    details: { device: 'laptop', need: 'setup' },
    daysFromToday: 5,
    start: '10:00',
    end: '12:00',
    budget: { type: 'fixed', priceCents: 4000 },
    offerCount: 2,
    postedHoursAgo: 21,
  },
];
