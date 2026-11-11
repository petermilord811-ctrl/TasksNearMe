import type {
  ActionResult,
  AddressSuggestion,
  AiTaskDraft,
  Photo,
  PostTaskHandlers,
  PostTaskPageData,
  TaskDraftInput,
} from '@/contracts';
import { routes } from '@/contracts';
import { austinMarket, categoryViews } from './marketing';
import { deskBreakdown, movingFundedBreakdown } from './money';

/**
 * The posting wizard (`/app/tasks/new`). "Now" is Tue, Nov 17, 2026, 9:00 am in Austin, so
 * Saturday Nov 21 10:00 am–1:00 pm is inside the 3-hour / 14-day window.
 */
export const POSTING_NOW = '2026-11-17T15:00:00.000Z';

export const postTaskPageData: PostTaskPageData = {
  market: austinMarket,
  categories: categoryViews,
  rules: { minLeadHours: 3, maxLeadDays: 14, maxPhotos: 8, maxPhotoMegabytes: 10, maxExpenseAllowanceCents: 50000 },
  aiDraftingEnabled: true,
  now: POSTING_NOW,
};

/** Started from a category page (`?category=computer-help`), with AI drafting turned off. */
export const postTaskComputerHelpNoAiData: PostTaskPageData = {
  ...postTaskPageData,
  initialCategory: 'computer-help',
  aiDraftingEnabled: false,
};

/** Maya's desk, complete: matches `deskPublicTask` once posted. */
export const deskDraft: TaskDraftInput = {
  categorySlug: 'furniture-assembly',
  title: 'Assemble a desk (flat-pack, 1 item)',
  description: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
  details: { itemType: 'desk', itemCount: 1, brand: 'IKEA', floor: 2, elevator: true, toolsOnSite: false },
  photoIds: ['ph_box'],
  location: { mode: 'local', placeId: 'plc_mueller_1234', unit: 'Apt 2B', accessNotes: 'Buzz 2B at the side gate.' },
  schedule: { date: '2026-11-21', flexible: false, startTime: '10:00', endTime: '13:00' },
  budget: { type: 'fixed', priceCents: 6000 },
};

/** Chris's move: hourly with a cap, and an expense allowance. */
export const movingDraft: TaskDraftInput = {
  categorySlug: 'moving-help',
  title: 'Help loading a moving truck',
  description: 'Two-bedroom apartment, boxes are packed. Couch, dresser, and a queen bed. Truck is rented.',
  details: { moveType: 'load_truck', rooms: 2, heavyItems: 'Couch, dresser, queen bed', stairFlights: 1, elevator: false },
  photoIds: [],
  location: { mode: 'local', placeId: 'plc_crestview_88' },
  schedule: { date: '2026-11-22', flexible: false, startTime: '09:00', endTime: '13:00' },
  budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
  expenseAllowance: { amountCents: 2000, description: 'Up to $20 for moving blankets or tape' },
};

/** Ruth's remote computer help, any time that day. */
export const remoteHelpDraft: TaskDraftInput = {
  categorySlug: 'computer-help',
  title: 'Set up my new printer and laptop',
  description: 'New laptop and a wireless printer. I would like them talking to each other and a quick how-to.',
  details: { device: 'printer', need: 'setup' },
  photoIds: [],
  location: { mode: 'remote' },
  schedule: { date: '2026-11-19', flexible: true },
  budget: { type: 'fixed', priceCents: 4000 },
};

export const addressSuggestions: AddressSuggestion[] = [
  { placeId: 'plc_mueller_1234', line1: '1234 Example Lane', line2: 'Austin, TX 78723', areaName: 'Mueller', inServiceArea: true },
  { placeId: 'plc_mueller_1240', line1: '1240 Example Lane', line2: 'Austin, TX 78723', areaName: 'Mueller', inServiceArea: true },
  { placeId: 'plc_crestview_88', line1: '88 Sample Street', line2: 'Austin, TX 78757', areaName: 'Crestview', inServiceArea: true },
];

/** Outside the service area: offer the waitlist instead. */
export const outOfAreaSuggestion: AddressSuggestion = {
  placeId: 'plc_waco_100',
  line1: '100 Example Road',
  line2: 'Waco, TX 76701',
  inServiceArea: false,
};

export const aiDeskDraft: AiTaskDraft = {
  title: 'Assemble a flat-pack desk',
  description:
    'Assemble one flat-pack desk (about 40 parts). The box is in the living room, and the desk stays in the same room. Please bring a drill.',
  details: { itemType: 'desk', itemCount: 1, toolsOnSite: false },
  openQuestions: [
    'Which floor is it on, and is there an elevator?',
    'Should the desk be anchored to the wall?',
    'What brand or model is it?',
  ],
};

export const uploadedTaskPhotos: Photo[] = [
  { id: 'ph_box', src: '/samples/work-desk.svg', alt: 'The desk box in the living room', width: 800, height: 600 },
  { id: 'ph_room', src: '/samples/work-bookshelf.svg', alt: 'The corner where the desk will go', width: 800, height: 600 },
];

export const postTaskResults = {
  posted: { ok: true, code: 'submitted', redirectTo: routes.app.task('tsk_new') },
  prohibited: { ok: false, code: 'validation_failed', fieldErrors: { description: ['prohibited'] } },
  tooSoon: { ok: false, code: 'validation_failed', fieldErrors: { 'schedule.startTime': ['out_of_range'] } },
  limitReached: { ok: false, code: 'limit_reached' },
} satisfies Record<string, ActionResult>;

const wait = <T,>(value: T, ms = 500) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** Handlers for previews and tests. Address search filters the sample addresses by the query. */
export const fakePostTaskHandlers: PostTaskHandlers = {
  onDraftWithAi: () => wait({ ok: true, draft: aiDeskDraft }, 900),
  onSearchAddresses: ({ query }) =>
    wait(
      [...addressSuggestions, outOfAreaSuggestion].filter((s) =>
        `${s.line1} ${s.line2}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
      250,
    ),
  onUploadPhoto: () => wait({ ok: true, photo: uploadedTaskPhotos[0]! }, 700),
  onQuote: ({ budget }) => wait(budget.type === 'hourly' ? movingFundedBreakdown : deskBreakdown, 300),
  onPost: () => wait(postTaskResults.posted, 700),
};
