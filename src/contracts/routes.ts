import type { CategorySlug } from './common';
import type { FindWorkQuery } from './helper-work';
import type { ExactAddress } from './location';
import type { TaskBoardQuery } from './tasks';

/**
 * Typed route builders for every page (docs/blueprint/02 §1 + docs/ui/ui-contract.md §13).
 * UI code builds links only with these, so routes can change in one place.
 */

export const LEGAL_DOCS = [
  'terms',
  'privacy',
  'helper-agreement',
  'cancellation-policy',
  'rewards-terms',
  'community-guidelines',
  'prohibited-tasks',
] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export const ONBOARDING_STEPS = ['profile', 'services', 'area', 'identity', 'payout', 'background', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const DEFAULT_MARKET = 'austin';
const enc = encodeURIComponent;

/** Task board filters as URL parameters. Defaults (`when: any`, `sort: soonest`, page 1) are left out. */
function boardQuery(query: TaskBoardQuery): Record<string, string | undefined> {
  return {
    category: query.category,
    when: query.when && query.when !== 'any' ? query.when : undefined,
    remote: query.remoteOnly ? '1' : undefined,
    sort: query.sort && query.sort !== 'soonest' ? query.sort : undefined,
    page: query.page && query.page > 1 ? String(query.page) : undefined,
  };
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const routes = {
  home: () => '/',
  market: (market = DEFAULT_MARKET) => `/${enc(market)}`,
  category: (slug: CategorySlug, market = DEFAULT_MARKET) => `/${enc(market)}/${slug}`,
  /** Defaults (`when: any`, `sort: soonest`, page 1) are left out of the URL. */
  taskBoard: (market = DEFAULT_MARKET, query: TaskBoardQuery = {}) => withQuery(`/${enc(market)}/tasks`, boardQuery(query)),
  publicTask: (taskSlug: string) => `/tasks/${enc(taskSlug)}`,
  helperProfile: (handle: string) => `/helpers/${enc(handle)}`,
  howItWorks: () => '/how-it-works',
  becomeAHelper: () => '/become-a-helper',
  pricing: () => '/pricing',
  trustAndSafety: () => '/trust-and-safety',
  help: (slug?: string) => (slug ? `/help/${slug.split('/').map(enc).join('/')}` : '/help'),
  legal: (doc: LegalDoc) => `/legal/${doc}`,
  signIn: (next?: string) => withQuery('/sign-in', { next }),
  waitlist: () => '/waitlist',

  app: {
    home: () => '/app',
    tasks: () => '/app/tasks',
    newTask: () => '/app/tasks/new',
    task: (taskId: string) => `/app/tasks/${enc(taskId)}`,
    offer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}`,
    confirmOffer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}/confirm`,
    helpers: () => '/app/helpers',
    requestHelper: (handle: string, opts: { fromBookingId?: string; slotId?: string } = {}) =>
      withQuery(`/app/helpers/${enc(handle)}/request`, {
        from: opts.fromBookingId ? `booking:${opts.fromBookingId}` : undefined,
        slot: opts.slotId,
      }),
    saved: () => '/app/saved',
    /** The helper feed. Same parameters as the task board, plus `distance` (default `any`, left out). */
    findWork: (query: FindWorkQuery = {}) =>
      withQuery('/app/find-work', {
        ...boardQuery(query),
        distance: query.distance && query.distance !== 'any' ? query.distance : undefined,
      }),
    /** A task from the helper's side: full details, offer form, or "finish setup to make offers". */
    findWorkTask: (taskId: string) => `/app/find-work/${enc(taskId)}`,
    offers: (inviteId?: string) => withQuery('/app/offers', { invite: inviteId }),
    availability: () => '/app/availability',
    clients: () => '/app/clients',
    bookings: () => '/app/bookings',
    booking: (bookingId: string) => `/app/bookings/${enc(bookingId)}`,
    bookingChange: (bookingId: string, changeId: string) =>
      `/app/bookings/${enc(bookingId)}/changes/${enc(changeId)}`,
    bookingComplete: (bookingId: string) => `/app/bookings/${enc(bookingId)}/complete`,
    bookingProblem: (bookingId: string) => `/app/bookings/${enc(bookingId)}/problem`,
    bookingReview: (bookingId: string) => `/app/bookings/${enc(bookingId)}/review`,
    bookingCalendar: (bookingId: string) => `/app/bookings/${enc(bookingId)}/calendar.ics`,
    messages: () => '/app/messages',
    thread: (threadId: string) => `/app/messages/${enc(threadId)}`,
    payments: () => '/app/payments',
    /** A receipt for one booking (printable). */
    receipt: (bookingId: string) => `/app/payments/${enc(bookingId)}`,
    earnings: () => '/app/earnings',
    rewards: () => '/app/rewards',
    notifications: () => '/app/notifications',
    account: () => '/app/account',
    support: () => '/app/support',
    supportCase: (caseId: string) => `/app/support/${enc(caseId)}`,
    helperOnboarding: (step: OnboardingStep = 'profile') => `/app/helper/onboarding/${step}`,
    helperProfile: () => '/app/helper/profile',
    series: (seriesId: string) => `/app/series/${enc(seriesId)}`,
  },

  admin: {
    home: () => '/admin',
    verify: (next?: string) => withQuery('/admin/verify', { next }),
    search: (q: string) => withQuery('/admin/search', { q }),
    users: () => '/admin/users',
    user: (userId: string) => `/admin/users/${enc(userId)}`,
    task: (taskId: string) => `/admin/tasks/${enc(taskId)}`,
    reports: () => '/admin/reports',
    bookings: () => '/admin/bookings',
    booking: (bookingId: string) => `/admin/bookings/${enc(bookingId)}`,
    cases: () => '/admin/cases',
    case: (caseId: string) => `/admin/cases/${enc(caseId)}`,
    payments: () => '/admin/payments',
    rewards: () => '/admin/rewards',
    config: () => '/admin/config',
    audit: () => '/admin/audit',
    staff: () => '/admin/staff',
  },

  external: {
    /**
     * Google Maps search link for a helper who may see the exact address (only ExactAddressPanel
     * receives it). Access notes are never included.
     */
    googleMapsSearch: (address: ExactAddress) => {
      const query = [address.line1, address.line2, `${address.city}, ${address.state} ${address.zip}`]
        .filter(Boolean)
        .join(', ');
      return `https://www.google.com/maps/search/?api=1&query=${enc(query)}`;
    },
  },

  dev: {
    ui: () => '/dev/ui',
    /** Preview ids look like "group/variant"; each segment is encoded separately. */
    preview: (previewId: string) => `/dev/ui/${previewId.split('/').map(enc).join('/')}`,
  },
} as const;
