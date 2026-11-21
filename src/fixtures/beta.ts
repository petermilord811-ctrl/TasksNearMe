import type { ActionResult, AdminBetaHandlers, AdminBetaMarket, AdminBetaPageData, AdminInviteCodeView, ClientInviteHandlers, ClientInvitePageData, HelperInviteHandlers, HelperInvitePageData } from '@/contracts';
import { routes } from '@/contracts';
import { fakeHandler } from './actions';
import { morganStaffSummary } from './admin';
import { signInResults } from './auth';

/**
 * Private beta (src/contracts/beta.ts): the helper invite screen, and the staff page for Austin with
 * invites in every state. Invite links point at the local app.
 */

const APP = 'http://localhost:3000';

/** Helper setup while Austin's helper switch is on. */
export const helperInvite: HelperInvitePageData = { marketName: 'Austin' };
/** The same, after opening an invite link. */
export const helperInvitePrefilled: HelperInvitePageData = { marketName: 'Austin', code: 'HLPR7Q2M' };

export const helperInviteResults = {
  redeemed: { ok: true, code: 'redeemed', redirectTo: routes.app.helperOnboarding() },
  incorrect: signInResults.inviteIncorrect,
  expired: signInResults.inviteExpired,
  forClients: signInResults.inviteForClients,
} satisfies Record<string, ActionResult>;

export const fakeHelperInviteHandlers: HelperInviteHandlers = {
  // Previews stay put (only the hash changes).
  onRedeem: fakeHandler({ ok: true, code: 'redeemed', redirectTo: '#helper-setup' }),
};

/** Posting while Gainesville opens soon, for someone without a client invite (J-V8). */
export const clientInvite: ClientInvitePageData = { marketName: 'Gainesville' };
/** The same, after opening an invite link. */
export const clientInvitePrefilled: ClientInvitePageData = { marketName: 'Gainesville', code: 'GNV4KQ7P' };

export const clientInviteResults = {
  redeemed: { ok: true, code: 'redeemed' },
  incorrect: signInResults.inviteIncorrect,
  expired: signInResults.inviteExpired,
  forHelpers: { ok: false, code: 'validation_failed', fieldErrors: { inviteCode: ['for_helpers'] } },
} satisfies Record<string, ActionResult>;

export const fakeClientInviteHandlers: ClientInviteHandlers = {
  onRedeem: fakeHandler({ ok: true, code: 'redeemed' }),
};

const invite = (overrides: Partial<AdminInviteCodeView> & Pick<AdminInviteCodeView, 'id' | 'code' | 'label'>): AdminInviteCodeView => ({
  link: `${APP}${routes.invite(overrides.code.replaceAll('-', ''))}`,
  role: 'poster',
  status: 'active',
  uses: 0,
  maxUses: 20,
  createdAt: '2026-11-10T16:00:00.000Z',
  createdBy: morganStaffSummary,
  joined: [],
  ...overrides,
});

export const adminInvites = {
  mueller: invite({
    id: 'bic_mueller',
    code: 'MUELLER',
    label: 'Mueller neighborhood group',
    uses: 3,
    maxUses: 40,
    expiresAt: '2026-12-10T16:00:00.000Z',
    joined: [
      { id: 'usr_tmp_ines', displayName: '', joinedAt: '2026-11-13T19:40:00.000Z', signUpFinished: false },
      { id: 'usr_maya', displayName: 'Maya R.', joinedAt: '2026-11-12T15:05:00.000Z', signUpFinished: true },
      { id: 'usr_ana', displayName: 'Ana G.', joinedAt: '2026-11-11T22:30:00.000Z', signUpFinished: true },
    ],
  }),
  foundingHelpers: invite({
    id: 'bic_founding',
    code: 'HLPR-7Q2M',
    label: 'Founding helpers: East Austin',
    role: 'helper',
    uses: 1,
    maxUses: 10,
    expiresAt: '2026-11-24T16:00:00.000Z',
    joined: [{ id: 'usr_jordan', displayName: 'Jordan T.', joinedAt: '2026-11-11T17:00:00.000Z', signUpFinished: true }],
  }),
  usedUp: invite({
    id: 'bic_friends',
    code: 'K7QP-M4XD',
    label: "Morgan's friends and family",
    status: 'used_up',
    uses: 5,
    maxUses: 5,
    joined: [
      { id: 'usr_chris', displayName: 'Chris P.', joinedAt: '2026-11-04T18:00:00.000Z', signUpFinished: true },
      { id: 'usr_sam', displayName: 'Sam K.', joinedAt: '2026-11-03T18:00:00.000Z', signUpFinished: true },
    ],
  }),
  withdrawn: invite({
    id: 'bic_flyer',
    code: 'HYDE-PARK',
    label: 'Hyde Park flyer (posted by mistake)',
    status: 'revoked',
    revokedAt: '2026-11-09T14:20:00.000Z',
  }),
} satisfies Record<string, AdminInviteCodeView>;

const austin: AdminBetaMarket = {
  id: 'mkt_austin',
  name: 'Austin',
  gates: { sign_up: false, helpers: true },
  joined: { poster: 8, helper: 1 },
  codes: [adminInvites.mueller, adminInvites.foundingHelpers, adminInvites.usedUp, adminInvites.withdrawn],
};

/** A support lead: helpers are invite-only, sign-up is open. */
export const adminBetaPage: AdminBetaPageData = { markets: [austin], canManage: true, canSwitch: false };
/** An admin also flips the switches. */
export const adminBetaAdmin: AdminBetaPageData = { ...adminBetaPage, canSwitch: true };
/** Other staff read the same page. */
export const adminBetaReadOnly: AdminBetaPageData = { ...adminBetaPage, canManage: false };
/** Both switches on (the private beta proper). */
export const adminBetaInviteOnly: AdminBetaPageData = { ...adminBetaAdmin, markets: [{ ...austin, gates: { sign_up: true, helpers: true } }] };
/** Before the first invite. */
export const adminBetaEmpty: AdminBetaPageData = { canManage: true, canSwitch: true, markets: [{ ...austin, gates: { sign_up: false, helpers: false }, joined: { poster: 0, helper: 0 }, codes: [] }] };

export const adminBetaResults = {
  created: { ok: true, code: 'saved' },
  customInUse: { ok: false, code: 'validation_failed', fieldErrors: { customCode: ['in_use'] } },
} satisfies Record<string, ActionResult>;

export const fakeAdminBetaHandlers: AdminBetaHandlers = {
  onCreateCode: fakeHandler(adminBetaResults.created),
  onRevokeCode: fakeHandler({ ok: true, code: 'updated' }),
  onSetGate: fakeHandler({ ok: true, code: 'updated' }),
};
