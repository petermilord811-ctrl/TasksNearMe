import type { AdminCaseStatusFilter, AdminQueue } from './admin';
import type { AdminAuditFilters, AdminBookingFilter } from './admin-ops';
import type { AdminMoneyTab } from './admin-money';
import type { HelperBrowseQuery } from './helpers-browse';
import type { AdminRewardFilter } from './admin-people';
import type { AdminVerificationQueue } from './admin-verification';
import { DEFAULT_METRICS_PERIOD, type MetricsPeriodDays } from './analytics';
import type { CategorySlug } from './common';
import type { CommunityPostKind } from './community';
import type { FindWorkQuery } from './helper-work';
import type { DashboardQuery } from './home';
import type { ExactAddress } from './location';
import { PORTAL_Q_MAX, type PortalQuery } from './portal';
import { TASK_BOARD_Q_MAX, TASK_BOARD_TIMES, type TaskBoardQuery } from './tasks';

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

/** The first city (owner, 2026-11-17: Gainesville, FL; Austin until then, now a later city). */
const DEFAULT_MARKET = 'gainesville';
const enc = encodeURIComponent;

/** Task board filters as URL parameters. Defaults (`when: any`, `sort: soonest`, page 1) are left out. */
/**
 * The board's filters as URL parameters (completion plan 7.4), in a fixed order and without defaults, so the
 * same filters always make the same URL. Lists (`area`, `time`) are comma-separated and sorted.
 */
function boardQuery(query: TaskBoardQuery): Record<string, string | undefined> {
  const q = query.q?.trim().slice(0, TASK_BOARD_Q_MAX);
  return {
    category: query.category,
    type: query.category && query.type ? query.type : undefined,
    q: q ? q : undefined,
    area: query.areas?.length ? [...new Set(query.areas)].sort().join(',') : undefined,
    min: query.minPrice !== undefined ? String(query.minPrice) : undefined,
    max: query.maxPrice !== undefined ? String(query.maxPrice) : undefined,
    pricing: query.pricing,
    posted: query.posted,
    time: query.times?.length ? TASK_BOARD_TIMES.filter((time) => query.times!.includes(time)).join(',') : undefined,
    few: query.few ? '1' : undefined,
    when: query.when && query.when !== 'any' ? query.when : undefined,
    remote: query.remoteOnly ? '1' : undefined,
    sort: query.sort && query.sort !== 'soonest' ? query.sort : undefined,
    view: query.view && query.view !== 'list' ? query.view : undefined,
    group: query.group && query.group !== 'area' ? query.group : undefined,
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
  /** "How much does … cost in Austin?" for one service (docs/seo/PLAN.md S5). */
  costGuide: (slug: CategorySlug, market = DEFAULT_MARKET) => `/${enc(market)}/${slug}/cost`,
  /**
   * The open tasks. Defaults (`when: any`, `sort: soonest`, page 1) are left out of the URL. One category is a page of
   * its own, that category's job hub (`/austin/tasks/moving-help`, docs/seo/PLAN.md S4), with the other filters as
   * parameters; src/proxy.ts sends the older `?category=` addresses there.
   */
  taskBoard: (market = DEFAULT_MARKET, query: TaskBoardQuery = {}) =>
    withQuery(query.category ? `/${enc(market)}/tasks/${query.category}` : `/${enc(market)}/tasks`, { ...boardQuery(query), category: undefined }),
  publicTask: (taskSlug: string) => `/tasks/${enc(taskSlug)}`,
  helperProfile: (handle: string) => `/helpers/${enc(handle)}`,
  howItWorks: () => '/how-it-works',
  becomeAHelper: () => '/become-a-helper',
  pricing: () => '/pricing',
  trustAndSafety: () => '/trust-and-safety',
  /** Who runs TasksNearMe and what it stands for (docs/seo/PLAN.md §11): the organization's page for people and search. */
  about: () => '/about',
  help: (slug?: string) => (slug ? `/help/${slug.split('/').map(enc).join('/')}` : '/help'),
  /** The help center's contact form for people who aren't signed in (5.22). */
  helpContact: () => '/help/contact',
  /** The "Not you?" link in an email or phone change notice (5.23): works without signing in, asks first. */
  contactRevert: (token: string) => withQuery('/account/not-me', { token }),
  legal: (doc: LegalDoc) => `/legal/${doc}`,
  signIn: (next?: string) => withQuery('/sign-in', { next }),
  /** Creating an account (completion plan 9.6): the same steps as sign-in after its own first one. */
  signUp: (next?: string) => withQuery('/sign-up', { next }),
  /** `from: 'beta'`: from an invite-only step (private beta) rather than from outside the service area. */
  /** `zip`: fills the form and shows how many people already wait near it (posting's "We're not in Dallas yet"). */
  waitlist: (query: { from?: 'beta'; zip?: string } = {}) => withQuery('/waitlist', { from: query.from, zip: query.zip }),
  /**
   * The unsubscribe link in a waitlist email (plan 8.3): works without signing in, asks first. Under /email, with the
   * account emails' unsubscribe page, so crawlers stay out (src/modules/seo/robots.ts).
   */
  waitlistUnsubscribe: (token: string) => withQuery('/email/waitlist', { token }),
  /** Where we're open and where we go next (plan 8.7); with a state's slug (`florida`), that state's page. */
  cities: (stateSlug?: string) => (stateSlug ? `/cities/${enc(stateSlug)}` : '/cities'),
  /** An invite link (private beta): keeps the code for sign-up or helper setup, then opens sign-in. */
  invite: (code: string) => `/invite/${enc(code)}`,

  app: {
    /**
     * The dashboard (completion plan 9.9). Defaults (`list`, `active`, any date) are left out; without `tab` the
     * person's first tab shows.
     */
    home: (query: DashboardQuery = {}) =>
      withQuery('/app', {
        tab: query.tab,
        view: query.view && query.view !== 'list' ? query.view : undefined,
        status: query.status && query.status !== 'active' ? query.status : undefined,
        date: query.date && query.date !== 'any' ? query.date : undefined,
        category: query.category,
        q: query.q?.trim() || undefined,
      }),
    tasks: () => '/app/tasks',
    /** The posting wizard; `category` starts it in that category. */
    /** The posting wizard; `describe` carries someone's own words in (the landing page's assistant). */
    /** `ai`: the wizard drafts the task with AI from `describe` as it opens (when the market allows it). */
    /** `again`: "Post again" (plan 4.2): one of the poster's own finished tasks, repeated (`PostTaskPageData.repeat`). */
    /** `template`: start from one of the examples (`TASK_TEMPLATE_IDS`), as a page's "Post a task like this". */
    /** `fromPost`: "Ask for help" (plan 9.10): the author's own community post, filled in by the server and linked once posted. */
    newTask: (query: { category?: CategorySlug; title?: string; describe?: string; ai?: boolean; again?: string; template?: string; fromPost?: string } = {}) =>
      withQuery('/app/tasks/new', { category: query.category, title: query.title, describe: query.describe, ai: query.ai ? '1' : undefined, again: query.again, template: query.template, from: query.fromPost }),
    task: (taskId: string) => `/app/tasks/${enc(taskId)}`,
    offer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}`,
    confirmOffer: (taskId: string, offerId: string) => `/app/tasks/${enc(taskId)}/offers/${enc(offerId)}/confirm`,
    /** Report a task, a helper's profile or a review (B-059). `id` is the task id, the helper's handle or the review id. */
    /** `answer`: the answer on a task question, by the question's id. */
    report: (kind: 'task' | 'helper' | 'review' | 'post' | 'reply' | 'question' | 'answer', id: string) => `/app/report/${kind}/${enc(id)}`,
    /** Browse and search helpers: category, the area they serve, open times this week, name. */
    helpers: (query: HelperBrowseQuery = {}) => withQuery('/app/helpers', { category: query.category, area: query.area, q: query.q, open: query.openTimes ? '1' : undefined }),
    requestHelper: (handle: string, opts: { fromBookingId?: string; slotId?: string } = {}) =>
      withQuery(`/app/helpers/${enc(handle)}/request`, {
        from: opts.fromBookingId ? `booking:${opts.fromBookingId}` : undefined,
        slot: opts.slotId,
      }),
    saved: () => '/app/saved',
    /** Saved searches and their alerts (plan 7.10). */
    savedSearches: () => '/app/saved-searches',
    /** Opens a saved search's board view. */
    savedSearch: (searchId: string) => `/app/saved-searches/${enc(searchId)}`,
    /** Rename a saved search, change its alerts and its filters (sweep SS5). */
    editSavedSearch: (searchId: string) => `/app/saved-searches/${enc(searchId)}/edit`,
    /** Save the board or find work view at `from` (its path and query). */
    newSavedSearch: (from: string) => withQuery('/app/saved-searches/new', { from }),
    /** A client's ID check, when risk asks for one; `next` is where to go once verified (an app path). */
    verifyIdentity: (next?: string) => withQuery('/app/verify-identity', { next }),
    /** The phone check that posting asks for, inside the app (journeys on a phone, J-C2); `next` is where it goes after. */
    verifyPhone: (next?: string) => withQuery('/app/verify-phone', { next }),
    /** The helper feed. Same parameters as the task board, plus `distance` (default `any`, left out). */
    /** Defaults (`when: any`, `sort: soonest`, `distance: any`, the list, page 1) are left out of the URL. */
    findWork: (query: FindWorkQuery = {}) =>
      withQuery('/app/find-work', {
        // Every board filter (completion plan 7.4: keyword, type, neighborhoods, price, time of day…), then find work's own.
        ...boardQuery({ category: query.category, type: query.type, q: query.q, areas: query.areas, minPrice: query.minPrice, maxPrice: query.maxPrice, pricing: query.pricing, posted: query.posted, times: query.times, few: query.few, when: query.when, remoteOnly: query.remoteOnly, page: query.page }),
        sort: query.sort && query.sort !== 'soonest' ? query.sort : undefined,
        distance: query.distance && query.distance !== 'any' ? query.distance : undefined,
        saved: query.saved ? '1' : undefined,
        view: query.view === 'map' ? 'map' : undefined,
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
    /** A conversation; `from` (its `earlier`): from that message on, after "Load earlier messages" (sweep MN11). */
    thread: (threadId: string, page: { from?: string } = {}) => withQuery(`/app/messages/${enc(threadId)}`, { from: page.from }),
    /**
     * The neighborhood portal (plan 9.10): posts and tasks near you, as a Feed or a List, over one set of filters.
     * Defaults (near you, everything, any time, `hot`, the Feed, by neighborhood, page 1) are left out, in a fixed
     * order, so the same filters always make the same URL.
     */
    community: (query: PortalQuery = {}) => {
      const q = query.q?.trim().slice(0, PORTAL_Q_MAX);
      return withQuery('/app/community', {
        area: query.area,
        category: query.category,
        type: query.type,
        time: query.time,
        q: q ? q : undefined,
        saved: query.saved ? '1' : undefined,
        sort: query.sort && query.sort !== 'hot' ? query.sort : undefined,
        view: query.view && query.view !== 'feed' ? query.view : undefined,
        group: query.group && query.group !== 'area' ? query.group : undefined,
        page: query.page && query.page > 1 ? String(query.page) : undefined,
      });
    },
    communityPost: (postId: string) => `/app/community/${enc(postId)}`,
    newCommunityPost: (kind?: CommunityPostKind) => withQuery('/app/community/new', { kind }),
    payments: () => '/app/payments',
    /** A receipt for one booking (printable). */
    receipt: (bookingId: string) => `/app/payments/${enc(bookingId)}`,
    earnings: () => '/app/earnings',
    rewards: () => '/app/rewards',
    /** The person's plan (completion plan 9.13): what it adds, subscribe, or manage and cancel. */
    plan: () => '/app/plan',
    notifications: () => '/app/notifications',
    account: () => '/app/account',
    support: () => '/app/support',
    supportCase: (caseId: string) => `/app/support/${enc(caseId)}`,
    helperOnboarding: (step: OnboardingStep = 'profile') => `/app/helper/onboarding/${step}`,
    helperProfile: () => '/app/helper/profile',
    /** Regular visits (blueprint 03 §7). */
    series: (seriesId: string) => `/app/series/${enc(seriesId)}`,
  },

  /** Downloads the app serves from route handlers. */
  api: {
    /** The signed-in person's prepared copy of their data (a JSON file), while it's ready. */
    dataExport: () => '/api/account/data-export',
    /** Finance: a booking's chargeback evidence pack (a JSON file), while the client's bank disputes its charge (T-18). */
    evidencePack: (bookingId: string) => `/api/admin/bookings/${enc(bookingId)}/evidence-pack`,
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
    /** Saved replies staff start a case reply from (leads write them). */
    savedReplies: () => '/admin/saved-replies',
    /** Where each queue stands against its response targets. */
    responseTimes: () => '/admin/response-times',
    /** Market metrics: the launch targets, the funnel, liquidity and reward spend (30 days unless another period). */
    /** The webhook inbox's failing and dead events (admins and finance). */
    webhooks: () => '/admin/webhooks',
    jobs: () => '/admin/jobs',
    metrics: (days?: MetricsPeriodDays) => withQuery('/admin/metrics', { days: days && days !== DEFAULT_METRICS_PERIOD ? String(days) : undefined }),
    /** The private beta: invite-only switches per market, invite codes and who joined with them. */
    beta: () => '/admin/beta',
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
    /** Directions to the address in Google Maps (no key; nothing stored). */
    googleMapsDirections: (address: ExactAddress) => {
      const query = [address.line1, address.line2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join(', ');
      return `https://www.google.com/maps/dir/?api=1&destination=${enc(query)}`;
    },
    /** Directions to the address in Apple Maps. */
    appleMapsDirections: (address: ExactAddress) => {
      const query = [address.line1, address.line2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join(', ');
      return `https://maps.apple.com/?daddr=${enc(query)}`;
    },
  },

  dev: {
    ui: () => '/dev/ui',
    /** Preview ids look like "group/variant"; each segment is encoded separately. */
    preview: (previewId: string) => `/dev/ui/${previewId.split('/').map(enc).join('/')}`,
  },
} as const;
