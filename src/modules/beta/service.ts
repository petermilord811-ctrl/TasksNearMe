import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  betaGateInputSchema,
  inviteCodeCreateSchema,
  type ActionResult,
  type AdminBetaMarket,
  type AdminBetaPageData,
  type AdminInviteCodeView,
  type BetaGateInput,
  type BetaRole,
  type InviteCodeCreateInput,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { getFlags } from '@/modules/markets/queries';
import { featureFlags, markets } from '@/modules/markets/schema';
import { staffById, type StaffActor } from '@/modules/support/staff';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import {
  BETA_FLAGS,
  betaGatesFrom,
  canManageBeta,
  canSwitchBeta,
  codeFitsUse,
  displayInviteCode,
  generateInviteCode,
  inviteCodeStatus,
  normalizeInviteCode,
  type BetaGates,
  type InviteUse,
} from './rules';
import { betaAccess, betaInviteCodes } from './schema';

/** Private beta data (blueprint 11 B-068): who has access, redeeming invites, and the staff page. */

const BETA_ROLE_SET = new Set<string>(['poster', 'helper']);
const isBetaRole = (value: string): value is BetaRole => BETA_ROLE_SET.has(value);

export async function betaGatesFor(db: Db, marketId: string, forced = false): Promise<BetaGates> {
  return betaGatesFrom(await getFlags(marketId, db), forced);
}

export async function accessRoles(db: Db, userId: string, marketId: string): Promise<BetaRole[]> {
  const rows = await db
    .select({ role: betaAccess.role })
    .from(betaAccess)
    .where(and(eq(betaAccess.userId, userId), eq(betaAccess.marketId, marketId)));
  return rows.map((row) => row.role).filter(isBetaRole);
}

class InviteUnavailable extends Error {}

/**
 * Uses an invite for `use` in the person's market. One use per person and role: someone who already has
 * that access gets `redeemed` without using the code again. The grant and the use happen together, and the
 * use only counts while the code is live, so two people can't take its last use.
 */
export async function redeemInvite(
  db: Db,
  input: { userId: string; marketId: string; code: string; use: InviteUse },
  now: Date,
): Promise<ActionResult> {
  const code = normalizeInviteCode(input.code);
  const [row] = await db.select().from(betaInviteCodes).where(eq(betaInviteCodes.code, code)).limit(1);
  if (!row || row.marketId !== input.marketId || !isBetaRole(row.role)) return fieldError('inviteCode', 'incorrect');
  if (!codeFitsUse(row.role, input.use)) return fieldError('inviteCode', 'not_supported');
  // Already in with this role (say, entering it again from the link): fine, whatever the code's state now.
  const [already] = await db
    .select({ userId: betaAccess.userId })
    .from(betaAccess)
    .where(and(eq(betaAccess.userId, input.userId), eq(betaAccess.marketId, input.marketId), eq(betaAccess.role, row.role)))
    .limit(1);
  if (already) return { ok: true, code: 'redeemed' };
  if (inviteCodeStatus(row, now) !== 'active') return fieldError('inviteCode', 'expired');

  try {
    await db.transaction(async (tx) => {
      const granted = await tx
        .insert(betaAccess)
        .values({ userId: input.userId, marketId: input.marketId, role: row.role, codeId: row.id, grantedAt: now })
        .onConflictDoNothing()
        .returning({ userId: betaAccess.userId });
      if (granted.length === 0) return; // Already in with this role: the code isn't used again.
      const used = await tx
        .update(betaInviteCodes)
        .set({ uses: sql`${betaInviteCodes.uses} + 1` })
        .where(
          and(
            eq(betaInviteCodes.id, row.id),
            isNull(betaInviteCodes.revokedAt),
            or(isNull(betaInviteCodes.expiresAt), gt(betaInviteCodes.expiresAt, now)),
            lt(betaInviteCodes.uses, betaInviteCodes.maxUses),
          ),
        )
        .returning({ id: betaInviteCodes.id });
      if (used.length === 0) throw new InviteUnavailable();
    });
  } catch (error) {
    if (error instanceof InviteUnavailable) return fieldError('inviteCode', 'expired');
    throw error;
  }
  return { ok: true, code: 'redeemed' };
}

// ---- Staff ----------------------------------------------------------------------------------------------

const JOINERS_SHOWN = 50;
/** Markets people can be invited into: pre-launch (invited bookings) and live. Paused ones are invisible. */
const INVITE_STATUSES = ['prelaunch', 'live'] as const;

export async function getAdminBetaPage(db: Db, staff: StaffActor, now: Date, appUrl: string): Promise<AdminBetaPageData> {
  // Invites are for cities that are open or about to open: a paused market (Gainesville until plan 8.1) has none.
  const marketRows = await db.select({ id: markets.id, name: markets.name }).from(markets).where(inArray(markets.status, [...INVITE_STATUSES])).orderBy(markets.name);
  const marketIds = marketRows.map((m) => m.id);
  const [codeRows, accessRows] = await Promise.all([
    marketIds.length ? db.select().from(betaInviteCodes).where(inArray(betaInviteCodes.marketId, marketIds)).orderBy(desc(betaInviteCodes.createdAt)) : [],
    marketIds.length
      ? db
          .select({
            userId: betaAccess.userId,
            marketId: betaAccess.marketId,
            role: betaAccess.role,
            codeId: betaAccess.codeId,
            grantedAt: betaAccess.grantedAt,
            name: users.name,
            termsAcceptedAt: users.termsAcceptedAt,
          })
          .from(betaAccess)
          .innerJoin(users, eq(users.id, betaAccess.userId))
          .where(inArray(betaAccess.marketId, marketIds))
          .orderBy(desc(betaAccess.grantedAt))
      : [],
  ]);
  const creators = await staffById(db, codeRows.map((row) => row.createdByUserId));

  const views = new Map<string, AdminInviteCodeView[]>();
  for (const row of codeRows) {
    const createdBy = creators.get(row.createdByUserId);
    if (!createdBy || !isBetaRole(row.role)) continue;
    const joined = accessRows
      .filter((access) => access.codeId === row.id)
      .slice(0, JOINERS_SHOWN)
      .map((access) => ({ id: access.userId, displayName: access.name, joinedAt: access.grantedAt.toISOString(), signUpFinished: access.termsAcceptedAt !== null }));
    const view: AdminInviteCodeView = {
      id: row.id,
      code: displayInviteCode(row.code),
      link: `${appUrl}/invite/${encodeURIComponent(row.code)}`,
      label: row.label,
      role: row.role,
      status: inviteCodeStatus(row, now),
      uses: row.uses,
      maxUses: row.maxUses,
      ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
      createdAt: row.createdAt.toISOString(),
      createdBy,
      ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
      joined,
    };
    views.set(row.marketId, [...(views.get(row.marketId) ?? []), view]);
  }

  const result: AdminBetaMarket[] = [];
  for (const market of marketRows) {
    const gates = await betaGatesFor(db, market.id);
    const codes = views.get(market.id) ?? [];
    const inMarket = accessRows.filter((access) => access.marketId === market.id);
    result.push({
      id: market.id,
      name: market.name,
      gates: { sign_up: gates.signUp, helpers: gates.helpers },
      joined: {
        poster: inMarket.filter((access) => access.role === 'poster').length,
        helper: inMarket.filter((access) => access.role === 'helper').length,
      },
      codes: [...codes.filter((c) => c.status === 'active'), ...codes.filter((c) => c.status !== 'active')],
    });
  }
  return { markets: result, canManage: canManageBeta(staff.roles), canSwitch: canSwitchBeta(staff.roles) };
}

async function audit(db: Db, staff: StaffActor, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
  await db.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: staff.roles[0] ?? 'staff', action, targetType, targetId, metadata });
}

export async function createInviteCode(
  db: Db,
  staff: StaffActor,
  input: InviteCodeCreateInput,
  now: Date,
  random: (size: number) => Uint8Array = (size) => new Uint8Array(randomBytes(size)),
): Promise<ActionResult> {
  if (!canManageBeta(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = inviteCodeCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { marketId, role, label, maxUses, expiresInDays, customCode } = parsed.data;
  const [market] = await db.select({ id: markets.id }).from(markets).where(and(eq(markets.id, marketId), inArray(markets.status, [...INVITE_STATUSES]))).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const expiresAt = typeof expiresInDays === 'number' ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000) : null;

  const custom = customCode ? normalizeInviteCode(customCode) : '';
  // A generated code that happens to exist already is drawn again; a custom one is the staff member's to change.
  for (let attempt = 0; attempt < (custom ? 1 : 5); attempt++) {
    const code = custom || generateInviteCode(random(32));
    const id = newId('bic');
    const inserted = await db
      .insert(betaInviteCodes)
      .values({ id, code, marketId, role, label, maxUses, expiresAt, createdByUserId: staff.id, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: betaInviteCodes.id });
    if (inserted.length > 0) {
      await audit(db, staff, 'beta.invite_create', 'beta_invite_code', id, { marketId, role, label, maxUses, expiresAt: expiresAt?.toISOString() ?? null });
      return { ok: true, code: 'saved' };
    }
  }
  return custom ? fieldError('customCode', 'in_use') : { ok: false, code: 'unknown' };
}

export async function revokeInviteCode(db: Db, staff: StaffActor, id: string, now: Date): Promise<ActionResult> {
  if (!canManageBeta(staff.roles)) return { ok: false, code: 'not_allowed' };
  const updated = await db
    .update(betaInviteCodes)
    .set({ revokedAt: now, revokedByUserId: staff.id })
    .where(and(eq(betaInviteCodes.id, String(id)), isNull(betaInviteCodes.revokedAt)))
    .returning({ id: betaInviteCodes.id });
  if (updated.length === 0) return { ok: false, code: 'not_found' };
  await audit(db, staff, 'beta.invite_revoke', 'beta_invite_code', String(id), {});
  return { ok: true, code: 'updated' };
}

const GATE_FLAG = { sign_up: BETA_FLAGS.signUp, helpers: BETA_FLAGS.helpers } as const;
const GATE_DESCRIPTION = {
  sign_up: 'Private beta: new accounts in this market need an invite code',
  helpers: 'Private beta: becoming a helper in this market needs a helper invite code',
} as const;

/** One market's switch (a market row in `feature_flags`, over the global default). */
export async function setBetaGate(db: Db, staff: StaffActor, input: BetaGateInput): Promise<ActionResult> {
  if (!canSwitchBeta(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = betaGateInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { marketId, gate, enabled } = parsed.data;
  const [market] = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const key = GATE_FLAG[gate];
  await db
    .insert(featureFlags)
    .values({ key, marketId, enabled, description: GATE_DESCRIPTION[gate] })
    .onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled } });
  await audit(db, staff, 'beta.set_gate', 'feature_flag', `${key}:${marketId}`, { enabled });
  return { ok: true, code: 'updated' };
}
