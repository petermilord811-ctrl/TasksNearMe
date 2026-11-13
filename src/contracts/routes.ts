import type { AdminCaseStatusFilter, AdminQueue } from './admin';
import type { AdminAuditFilters, AdminBookingFilter } from './admin-ops';
import type { AdminMoneyTab } from './admin-money';
import type { HelperBrowseQuery } from './helpers-browse';
import type { AdminRewardFilter } from './admin-people';
import type { AdminVerificationQueue } from './admin-verification';
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

/**
 * Helper onboarding, in order (blueprint 06 §1, extended 2026-11-12): the profile basics, then a verified
 * phone, the ID check, the home address with a proof-of-address document, payouts, and a background check
 * for in-home categories.
 */
export const ONBOARDING_STEPS = ['profile', 'services', 'area', 'phone', 'identity', 'address', 'payout', 'background', 'done'] as const;
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
    /** The posting wizard; `category` starts it in that category. */
    /** The posting wizard; `describe` carries someone's own words in (the landing page's assistant). */
    /** `ai`: the wizard drafts the task with AI from `describe` as it opens (when the market allows it). */
    newTask: (query: { category?: CategorySlug; title?: string; describe?: string; ai?: boolean } = {}) =>
      withQuery('/app/tasks/new', { category: query.category, title: query.title, describe: query.describe, ai: query.ai ? '1' : undefined }),
    task: (taskId: string) => `/app/tasks/${enc(taskId)}`,
    offer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}`,
    confirmOffer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}/confirm`,
    /** Report a task, a helper's profile or a review (B-059). `id` is the task id, the helper's handle or the review id. */
    report: (kind: 'task' | 'helper' | 'review', id: string) => `/app/report/${kind}/${enc(id)}`,
    /** Browse and search helpers: category, the area they serve, open times this week, name. */
    helpers: (query: HelperBrowseQuery = {}) => withQuery('/app/helpers', { category: query.category, area: query.area, q: query.q, open: query.openTimes ? '1' : undefined }),
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
    bookingProposeChange: (bookingId: string) => `/app/bookings/${enc(bookingId)}/changes/new`,
    /** The helper proposes a completed booking again (UI-032). */
    bookingRebook: (bookingId: string) => `/app/bookings/${enc(bookingId)}/rebook`,
    /** A rebooking proposal, for either person (UI-032). */
    proposal: (proposalId: string) => `/app/proposals/${enc(proposalId)}`,
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

  /** Static assets the app serves itself. */
  assets: {
    /** MapLibre's web worker (the landing map). The package version in the URL keeps a long cache safe across upgrades. */
    mapWorker: (version?: string) => withQuery('/vendor/maplibre-gl-worker.mjs', { v: version }),
  },

  admin: {
    home: () => '/admin',
    verify: (next?: string) => withQuery('/admin/verify', { next }),
    search: (q: string) => withQuery('/admin/search', { q }),
    users: (query?: string) => withQuery('/admin/users', { q: query }),
    user: (userId: string) => `/admin/users/${enc(userId)}`,
    task: (taskId: string) => `/admin/tasks/${enc(taskId)}`,
    reports: () => '/admin/reports',
    /** The bookings list (UI-033): a filter tab and a search (a booking id, a task title, a name or an email). */
    bookings: (query: { filter?: AdminBookingFilter; q?: string } = {}) => withQuery('/admin/bookings', { filter: query.filter, q: query.q }),
    booking: (bookingId: string) => `/admin/bookings/${enc(bookingId)}`,
    cases: (filters: { queue?: AdminQueue; status?: AdminCaseStatusFilter; mine?: boolean } = {}) =>
      withQuery('/admin/cases', { queue: filters.queue, status: filters.status, mine: filters.mine ? '1' : undefined }),
    case: (caseId: string) => `/admin/cases/${enc(caseId)}`,
    /** Money in and out (UI-034): a tab and a search (a booking id, a name or an email). */
    payments: (query: { tab?: AdminMoneyTab; q?: string } = {}) => withQuery('/admin/payments', { tab: query.tab, q: query.q }),
    rewards: (filter?: AdminRewardFilter) => withQuery('/admin/rewards', { status: filter }),
    config: () => '/admin/config',
    /** The audit log (UI-033); `before` is the cursor for older entries. */
    audit: (filters: AdminAuditFilters & { before?: string } = {}) =>
      withQuery('/admin/audit', { actor: filters.actor, action: filters.action, targetType: filters.targetType, targetId: filters.targetId, from: filters.from, to: filters.to, before: filters.before }),
    staff: () => '/admin/staff',
    /** Verification reviews: address proofs, ID name checks and attempts, background checks to adjudicate. */
    verifications: (queue?: AdminVerificationQueue) => withQuery('/admin/verifications', { queue }),
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
