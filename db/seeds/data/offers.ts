/**
 * Offers on the seeded open tasks, mirroring src/fixtures/offers.ts. Times are relative to each
 * task's window, so they stay valid whenever the seed runs.
 */
export interface SeedOffer {
  id: string;
  taskId: string;
  helperUserId: string;
  pricing: { type: 'fixed'; priceCents: number } | { type: 'hourly'; rateCents: number; estimatedHours: number; hoursCap: number };
  /** Minutes after the task's window starts. */
  startOffsetMinutes: number;
  message: string;
  brings: string[];
  revision: number;
  /** Hours before the seed runs. */
  submittedHoursAgo: number;
  seenByPoster: boolean;
}

export const SEED_OFFERS: SeedOffer[] = [
  {
    id: 'off_jordan',
    taskId: 'tsk_desk',
    helperUserId: 'usr_jordan',
    pricing: { type: 'fixed', priceCents: 6000 },
    startOffsetMinutes: 0,
    message: 'Happy to help! I bring my own drill and a level, and I take the packaging with me.',
    brings: ['Drill', 'Level'],
    revision: 1,
    submittedHoursAgo: 2,
    seenByPoster: false,
  },
  {
    id: 'off_sam',
    taskId: 'tsk_desk',
    helperUserId: 'usr_sam',
    pricing: { type: 'fixed', priceCents: 5500 },
    startOffsetMinutes: 30,
    message: 'I have built this exact desk twice. About an hour of work.',
    brings: ['Drill', 'Hex keys'],
    revision: 2,
    submittedHoursAgo: 17,
    seenByPoster: true,
  },
  {
    id: 'off_lee',
    taskId: 'tsk_desk',
    helperUserId: 'usr_lee',
    pricing: { type: 'fixed', priceCents: 5000 },
    startOffsetMinutes: 60,
    message: 'Can do Saturday late morning. Text me at 512-555-0134 if anything changes.',
    brings: [],
    revision: 1,
    submittedHoursAgo: 20,
    seenByPoster: true,
  },
  {
    id: 'off_sam_yard',
    taskId: 'tsk_yard',
    helperUserId: 'usr_sam',
    pricing: { type: 'fixed', priceCents: 12000 },
    startOffsetMinutes: 0,
    message: 'I can rake and bag everything and leave the bags at the curb for pickup.',
    brings: ['Rake', 'Leaf blower'],
    revision: 1,
    submittedHoursAgo: 30,
    seenByPoster: false,
  },
  {
    id: 'off_lee_computer',
    taskId: 'tsk_computer',
    helperUserId: 'usr_lee',
    pricing: { type: 'fixed', priceCents: 4000 },
    startOffsetMinutes: 0,
    message: 'I can move your photos and set up email over a screen share. You stay in control the whole time.',
    brings: [],
    revision: 1,
    submittedHoursAgo: 6,
    seenByPoster: false,
  },
];
