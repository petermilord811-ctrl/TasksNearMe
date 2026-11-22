import type { AdminConfigHandlers, AdminConfigPageData, AdminMarketRow, AdminMarketsPageData, AdminPolicyValues } from '@/contracts';

/** Staff tools, part 7 (UI-038): Austin's config, as Riley (an admin) sees it. */

const launch: AdminPolicyValues = {
  posterBps: 1000,
  posterMinCents: 300,
  helperBps: 1000,
  freeUntilHours: 24,
  lateFeeBps: 2000,
  lateFeeMinCents: 1000,
  autoApproveHours: 72,
  inviteTtlHours: 48,
  pendingFundingMinutes: 30,
  noShowMinutes: 30,
  addressHideAfterHours: 48,
  maxLeadDays: 14,
  minLeadHours: 3,
};

/**
 * The Markets section (completion plan 8.2), as Riley (an admin) sees it: Austin in pre-launch, Gainesville paused with
 * helpers and a waitlist waiting for it, Tulsa live with its waitlist's "we're open" email still going out (8.3), and
 * Laredo paused and refused, its row made with a zone whose clock no supported US zone keeps (America/Mexico_City,
 * which dropped daylight saving; plan 8.1). Counts are made up for previews.
 */
export const adminMarketRows: AdminMarketRow[] = [
  {
    id: 'mkt_austin', slug: 'austin', name: 'Austin', state: 'TX', status: 'prelaunch', zipPrefixes: ['786', '787'], timeZone: 'America/Chicago',
    helpersWaiting: 4,
    homePage: false,
    waitlist: { entries: 61, told: 0, queued: 0, toTell: 58, failed: 0 },
    lastChange: { at: '2026-11-17T16:20:00.000Z', by: 'Riley N.', reason: 'Austin waits while Gainesville opens first (owner, Nov 17).', from: 'live', to: 'prelaunch' },
    actions: [
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 58, accountsTold: 12 },
      { id: 'paused', kind: 'destructive', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 0, accountsTold: 0 },
    ],
  },
  {
    id: 'mkt_gainesville', slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'paused', zipPrefixes: ['326'], timeZone: 'America/New_York',
    helpersWaiting: 23,
    homePage: true,
    waitlist: { entries: 214, told: 0, queued: 0, toTell: 209, failed: 0 },
    actions: [
      { id: 'prelaunch', kind: 'secondary', enabled: true, confirm: true, helpersIn: 23, waitlistEmails: 0, accountsTold: 0 },
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 23, waitlistEmails: 209, accountsTold: 0 },
    ],
  },
  {
    id: 'mkt_laredo', slug: 'laredo', name: 'Laredo', state: 'TX', status: 'paused', zipPrefixes: ['780'], timeZone: 'America/Mexico_City',
    helpersWaiting: 2,
    homePage: false,
    waitlist: { entries: 17, told: 0, queued: 0, toTell: 17, failed: 0 },
    openingRefused: 'time_zone_unsupported',
    actions: [
      { id: 'prelaunch', kind: 'secondary', enabled: false, confirm: true, helpersIn: 2, waitlistEmails: 0, accountsTold: 0 },
      { id: 'live', kind: 'primary', enabled: false, confirm: true, helpersIn: 2, waitlistEmails: 17, accountsTold: 0 },
    ],
  },
  {
    id: 'mkt_tulsa', slug: 'tulsa', name: 'Tulsa', state: 'OK', status: 'live', zipPrefixes: ['740', '741'], timeZone: 'America/Chicago',
    helpersWaiting: 1,
    homePage: false,
    waitlist: { entries: 133, told: 96, queued: 31, toTell: 2, failed: 3 },
    lastChange: { at: '2026-11-18T14:05:00.000Z', by: 'Riley N.', reason: 'Tulsa meets the supply and quality criteria: opening to everyone.', from: 'prelaunch', to: 'live' },
    actions: [
      { id: 'prelaunch', kind: 'secondary', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 0, accountsTold: 0 },
      { id: 'paused', kind: 'destructive', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 0, accountsTold: 0 },
    ],
  },
];

/** `/admin/config`: version 1 in use, a draft 2 waiting. */
export const adminConfigData: AdminConfigPageData = {
  market: { id: 'mkt_austin', name: 'Austin', slug: 'austin' },
  markets: adminMarketRows,
  outage: { paused: false, changed: { at: '2026-11-02T14:05:00.000Z', by: 'Riley N.', reason: 'Stripe confirmed the charge errors are fixed; charges are going through again.' } },
  // Search engines: never changed, the site's default (site pages only), as on the live site before launch.
  searchIndexing: { setting: 'site', isDefault: true, effective: 'site' },
  current: { id: 'pol_austin_1', version: 1, status: 'published', publishedAt: '2026-10-15T15:00:00.000Z', publishedBy: 'Riley N.', values: launch },
  history: [
    { id: 'pol_austin_2', version: 2, status: 'draft', values: { ...launch, lateFeeMinCents: 1200 } },
    { id: 'pol_austin_1', version: 1, status: 'published', publishedAt: '2026-10-15T15:00:00.000Z', publishedBy: 'Riley N.', values: launch },
  ],
  flags: [
    { key: 'ai_drafting', description: 'Writing help: Help me describe this when posting, Write it for me on helper profiles and offers', enabled: true },
    { key: 'background_checks', description: 'Require background checks for in-home categories', enabled: true },
    { key: 'recurring', description: 'Regular visits for cleaning and yard work: helpers propose a schedule, each visit is charged 2 days before', enabled: true },
    { key: 'reward.acceptance', description: '5% offer-acceptance reward (off at launch)', enabled: false },
    { key: 'reward.completion', description: 'Completion bonus on flagged tasks (off at launch)', enabled: false },
    { key: 'reward.repeat', description: '$10 gift card on the 3rd paid booking with the same client', enabled: true },
    { key: 'reward.welcome', description: '$50 welcome gift card for the founding cohort', enabled: true },
  ],
  // Neighbors' pinned cards (plan 10.16): the launch welcome showing, last month's holiday note ended.
  announcements: [
    {
      id: 'can_welcome',
      market: { id: 'mkt_austin', name: 'Austin' },
      titleEn: 'Welcome to Neighbors in Austin',
      bodyEn: 'Ask who to hire, share what worked, and thank the helpers you booked. Exact addresses never go here.',
      titleEs: 'Bienvenidos a Vecinos en Austin',
      bodyEs: 'Pregunta a quién contratar, comparte lo que te funcionó y agradece a quienes contrataste. Las direcciones exactas nunca van aquí.',
      startsAt: '2026-11-16T15:00:00.000Z',
      endsAt: '2026-12-15T06:00:00.000Z',
      state: 'live',
      createdBy: 'Riley N.',
      dismissals: 12,
    },
    {
      id: 'can_holidays',
      market: { id: 'mkt_austin', name: 'Austin' },
      titleEn: 'Booking help over the holidays',
      bodyEn: 'Helpers set their own holiday hours. Book early for the week of Thanksgiving.',
      titleEs: 'Contratar ayuda en las fiestas',
      bodyEs: 'Cada ayudante fija su horario en las fiestas. Reserva con tiempo para la semana de Acción de Gracias.',
      startsAt: '2026-10-20T15:00:00.000Z',
      endsAt: '2026-11-10T06:00:00.000Z',
      state: 'ended',
      createdBy: 'Riley N.',
      dismissals: 30,
    },
  ],
};

/** The outage switch on during a payments incident (completion plan 5.15). */
export const adminConfigPausedData: AdminConfigPageData = {
  ...adminConfigData,
  outage: { paused: true, changed: { at: '2026-11-14T08:42:00.000Z', by: 'Riley N.', reason: 'Card charges are failing for everyone (Stripe incident); pausing new bookings until it clears.' } },
};

/** Launch day: an admin opened task pages and helper profiles to search (launch runbook J-L6). */
export const adminConfigSearchOpenData: AdminConfigPageData = {
  ...adminConfigData,
  searchIndexing: {
    setting: 'on',
    isDefault: false,
    effective: 'on',
    lastChange: { at: '2026-11-21T14:00:00.000Z', by: 'Riley N.', reason: 'Gainesville launch: open listings are real and moderated, as the launch runbook says.', from: 'site', to: 'on' },
  },
};

/** A copy of the app that isn't the live site (development): the setting says open, but this server stays out of search. */
export const adminConfigSearchElsewhereData: AdminConfigPageData = { ...adminConfigSearchOpenData, searchIndexing: { ...adminConfigSearchOpenData.searchIndexing, effective: 'off' } };

/** A market whose outage switch was never used. */
export const adminConfigNeverPausedData: AdminConfigPageData = { ...adminConfigData, outage: { paused: false } };

/**
 * A page loaded before Laredo's zone was refused (a stale page): its buttons arrive enabled, and the server's refusal
 * is what the confirm step shows.
 */
export const adminConfigStaleMarketsData: AdminConfigPageData = {
  ...adminConfigData,
  markets: adminMarketRows.map((market) => (market.openingRefused ? { ...market, openingRefused: undefined, actions: market.actions.map((action) => ({ ...action, enabled: true })) } : market)),
};

/** No markets at all (a fresh database). */
export const adminConfigNoMarketsData: AdminConfigPageData = { ...adminConfigData, markets: [] };

/** Staff who aren't admins (Alex P., a support agent): the markets, read-only, with no actions. */
export const adminMarketsReadOnlyData: AdminMarketsPageData = { markets: adminMarketRows.map((market) => ({ ...market, actions: [] })), readOnly: true };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminConfigHandlers: AdminConfigHandlers = {
  onPublishPolicy: () => wait({ ok: true as const, code: 'updated' as const }),
  onSetFlag: () => wait({ ok: true as const, code: 'updated' as const }),
  onSetOutage: () => wait({ ok: true as const, code: 'updated' as const }),
  onSetMarketStatus: () => wait({ ok: true as const, code: 'updated' as const }),
  onSetSearchIndexing: () => wait({ ok: true as const, code: 'updated' as const }),
  onPublishAnnouncement: () => wait({ ok: true as const, code: 'updated' as const }),
  onEndAnnouncement: () => wait({ ok: true as const, code: 'updated' as const }),
};
