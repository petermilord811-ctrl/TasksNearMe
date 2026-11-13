import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { staffAuthenticatorResetInputSchema, type ActionResult, type StaffAuthenticatorAction, type StaffAuthenticatorResetInput, type StaffAuthenticatorStatus, type StaffSetupCodeResult, type StaffVerifyPageData } from '@/contracts';
import { auditLog } from '@/platform/audit/schema';
import { newTotpSecret, otpauthUri, verifyTotp } from '@/platform/auth/totp';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit, rateLimitReached } from '@/platform/rate-limit';
import { validationFailed } from '@/platform/actions/results';
import { sessions, staffAuthenticators, staffRoles, staffSessionChecks, staffSetupCodes, users } from './schema';
import type { StaffActor } from '@/modules/support/staff';

/**
 * Staff two-step sign-in with an authenticator app (blueprint 07 §2, 08: staff sessions require TOTP).
 * A new staff member sets theirs up with a one-time setup code an admin gives them (valid 24 hours), so a
 * stolen staff email alone can't enroll a stranger's phone. Each session is checked once; each code works
 * once; 5 wrong codes in 10 minutes pause the checks. Outside production the development code 123456 still
 * works (tests and local work).
 */

const ISSUER = 'TasksNearMe Staff';
const SETUP_CODE_HOURS = 24;
const ATTEMPT_RULE = { limit: 5, windowSeconds: 10 * 60 };
export const DEV_STAFF_CODE = '123456';

const hashCode = (code: string, secret: string) => createHash('sha256').update(`tnm.staff-setup.v1.${secret}.${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest('hex');

/** "K7QD-29XM-PR": 10 characters people can read out (no 0/O, 1/I). */
function newSetupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export interface StaffAuthDeps {
  db: Db;
  cipher: FieldCipher;
  /** Hashes setup codes (BETTER_AUTH_SECRET). */
  secret: string;
  production: boolean;
}

async function authenticatorOf(db: Db, userId: string) {
  const [row] = await db.select().from(staffAuthenticators).where(eq(staffAuthenticators.userId, userId)).limit(1);
  return row ?? null;
}

export async function getStaffVerifyPage(deps: StaffAuthDeps, staff: { id: string; displayName: string; email: string }): Promise<StaffVerifyPageData> {
  const authenticator = await authenticatorOf(deps.db, staff.id);
  const base = { displayName: staff.displayName, devCodeAllowed: !deps.production };
  if (authenticator?.confirmedAt) return { step: 'code', ...base, canEnroll: false };
  if (authenticator) {
    const secret = deps.cipher.decrypt(authenticator.secretCiphertext);
    return { step: 'enroll', ...base, secret, otpauthUri: otpauthUri({ secret, account: staff.email, issuer: ISSUER }) };
  }
  // Development keeps its code step (with set-up beside it); production starts with the setup code.
  return deps.production ? { step: 'setup_code', ...base } : { step: 'code', ...base, canEnroll: true };
}

async function passSession(db: Db, sessionId: string) {
  await db.insert(staffSessionChecks).values({ sessionId }).onConflictDoNothing();
}

/** The code from the authenticator (or, outside production, the development code). */
export async function verifyStaffTotp(deps: StaffAuthDeps, staff: { id: string; sessionId: string }, code: string, now: Date): Promise<ActionResult> {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false, code: 'validation_failed', fieldErrors: { code: ['invalid'] } };
  // 5 wrong codes in 10 minutes pause the checks; right ones don't count.
  const key = `staff-two-step:user:${staff.id}`;
  if (!(await rateLimitReached(deps.db, key, ATTEMPT_RULE, now)).ok) return { ok: false, code: 'rate_limited' };
  if (!deps.production && clean === DEV_STAFF_CODE) {
    await passSession(deps.db, staff.sessionId);
    return { ok: true, code: 'updated' };
  }
  const wrong = async (): Promise<ActionResult> => {
    await consumeRateLimit(deps.db, key, ATTEMPT_RULE, now);
    return { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } };
  };
  const authenticator = await authenticatorOf(deps.db, staff.id);
  if (!authenticator?.confirmedAt) return wrong();
  const result = verifyTotp(deps.cipher.decrypt(authenticator.secretCiphertext), clean, now, authenticator.lastStep);
  if (!result.ok) {
    await deps.db.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: 'staff', action: 'staff.two_step_failed', targetType: 'user', targetId: staff.id });
    return wrong();
  }
  const [claimed] = await deps.db
    .update(staffAuthenticators)
    .set({ lastStep: result.step, updatedAt: now })
    .where(and(eq(staffAuthenticators.userId, staff.id), or(isNull(staffAuthenticators.lastStep), lt(staffAuthenticators.lastStep, result.step))))
    .returning({ userId: staffAuthenticators.userId });
  // A code already used (a replay) counts as a wrong one.
  if (!claimed) return wrong();
  await passSession(deps.db, staff.sessionId);
  return { ok: true, code: 'updated' };
}

/** A setup code from an admin starts enrollment: a new secret, shown to the staff member until confirmed. */
export async function redeemSetupCode(deps: StaffAuthDeps, staff: { id: string }, setupCode: string, now: Date): Promise<ActionResult> {
  const setupKey = `staff-setup:user:${staff.id}`;
  if (!(await rateLimitReached(deps.db, setupKey, ATTEMPT_RULE, now)).ok) return { ok: false, code: 'rate_limited' };
  const existing = await authenticatorOf(deps.db, staff.id);
  if (existing?.confirmedAt) return { ok: false, code: 'not_allowed' };
  const [row] = await deps.db
    .select()
    .from(staffSetupCodes)
    .where(and(eq(staffSetupCodes.userId, staff.id), eq(staffSetupCodes.codeHash, hashCode(setupCode, deps.secret)), isNull(staffSetupCodes.usedAt), gt(staffSetupCodes.expiresAt, now)))
    .limit(1);
  if (!row) {
    await consumeRateLimit(deps.db, setupKey, ATTEMPT_RULE, now);
    return { ok: false, code: 'validation_failed', fieldErrors: { setupCode: ['incorrect'] } };
  }
  await deps.db.update(staffSetupCodes).set({ usedAt: now }).where(eq(staffSetupCodes.id, row.id));
  const secretCiphertext = deps.cipher.encrypt(newTotpSecret());
  await deps.db
    .insert(staffAuthenticators)
    .values({ userId: staff.id, secretCiphertext, confirmedAt: null, lastStep: null, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: staffAuthenticators.userId, set: { secretCiphertext, confirmedAt: null, lastStep: null, updatedAt: now } });
  return { ok: true, code: 'updated' };
}

/** The first code from the app confirms the authenticator and passes this session. */
export async function confirmEnrollment(deps: StaffAuthDeps, staff: { id: string; sessionId: string }, code: string, now: Date): Promise<ActionResult> {
  const authenticator = await authenticatorOf(deps.db, staff.id);
  if (!authenticator || authenticator.confirmedAt) return { ok: false, code: 'not_allowed' };
  const key = `staff-two-step:user:${staff.id}`;
  if (!(await rateLimitReached(deps.db, key, ATTEMPT_RULE, now)).ok) return { ok: false, code: 'rate_limited' };
  const result = verifyTotp(deps.cipher.decrypt(authenticator.secretCiphertext), code.replace(/\s/g, ''), now, null);
  if (!result.ok) {
    await consumeRateLimit(deps.db, key, ATTEMPT_RULE, now);
    return { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } };
  }
  const [confirmed] = await deps.db
    .update(staffAuthenticators)
    .set({ confirmedAt: now, lastStep: result.step, updatedAt: now })
    .where(and(eq(staffAuthenticators.userId, staff.id), isNull(staffAuthenticators.confirmedAt)))
    .returning({ userId: staffAuthenticators.userId });
  if (!confirmed) return { ok: false, code: 'not_allowed' };
  await deps.db.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: 'staff', action: 'staff.authenticator_enrolled', targetType: 'user', targetId: staff.id });
  await passSession(deps.db, staff.sessionId);
  return { ok: true, code: 'updated' };
}

/** Their authenticator: none yet, set up but not confirmed, or in use. */
export const authenticatorStatusOf = (row: { confirmedAt: Date | null } | null | undefined): StaffAuthenticatorStatus =>
  !row ? 'none' : row.confirmedAt ? 'active' : 'pending';

/**
 * What an admin may do about someone's authenticator. Never their own: a stolen admin session could
 * otherwise swap in the thief's phone. A setup code helps only before an authenticator is in use.
 */
export function authenticatorActionsFor(viewerId: string, memberId: string, status: StaffAuthenticatorStatus): StaffAuthenticatorAction[] {
  if (viewerId === memberId) return [];
  if (status === 'none') return ['setup_code'];
  if (status === 'pending') return ['setup_code', 'reset'];
  return ['reset'];
}

async function isStaff(db: Db, userId: string) {
  const [row] = await db.select({ userId: staffRoles.userId }).from(staffRoles).where(eq(staffRoles.userId, userId)).limit(1);
  return Boolean(row);
}

/** Issues a setup code (24 hours, once); the person's earlier unused codes stop working. */
export async function issueSetupCode(deps: Pick<StaffAuthDeps, 'db' | 'secret'>, userId: string, actor: { id: string | null; role: string }, now: Date): Promise<{ setupCode: string; expiresAt: string }> {
  const setupCode = newSetupCode();
  const expiresAt = new Date(now.getTime() + SETUP_CODE_HOURS * 3_600_000);
  await deps.db.transaction(async (tx) => {
    await tx.update(staffSetupCodes).set({ usedAt: now }).where(and(eq(staffSetupCodes.userId, userId), isNull(staffSetupCodes.usedAt)));
    await tx.insert(staffSetupCodes).values({ id: newId('ssc'), userId, codeHash: hashCode(setupCode, deps.secret), createdByUserId: actor.id ?? 'system', expiresAt, createdAt: now });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: actor.id, actorRole: actor.role, action: 'staff.setup_code_created', targetType: 'user', targetId: userId, metadata: { expiresAt: expiresAt.toISOString() } });
  });
  return { setupCode, expiresAt: expiresAt.toISOString() };
}

/** Admins: a one-time setup code for another staff member with no authenticator in use (shown once). */
export async function createSetupCode(deps: StaffAuthDeps, admin: StaffActor, userId: string, now: Date): Promise<StaffSetupCodeResult> {
  if (!admin.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  if (!(await isStaff(deps.db, userId))) return { ok: false, code: 'not_found' };
  if (!authenticatorActionsFor(admin.id, userId, authenticatorStatusOf(await authenticatorOf(deps.db, userId))).includes('setup_code')) return { ok: false, code: 'not_allowed' };
  return { ok: true, ...(await issueSetupCode(deps, userId, { id: admin.id, role: 'admin' }, now)) };
}

/**
 * Admins: remove another staff member's authenticator (a lost or replaced phone), with a reason. Their
 * sessions lose the two-step check too, so whoever holds the old phone or a signed-in browser is asked again.
 */
export async function resetAuthenticator(deps: StaffAuthDeps, admin: StaffActor, input: StaffAuthenticatorResetInput, now: Date): Promise<ActionResult> {
  if (!admin.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = staffAuthenticatorResetInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { userId, reason } = parsed.data;
  if (!authenticatorActionsFor(admin.id, userId, authenticatorStatusOf(await authenticatorOf(deps.db, userId))).includes('reset')) return { ok: false, code: 'not_allowed' };
  await deps.db.transaction(async (tx) => {
    await tx.delete(staffAuthenticators).where(eq(staffAuthenticators.userId, userId));
    await tx.delete(staffSessionChecks).where(inArray(staffSessionChecks.sessionId, tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))));
    await tx.update(staffSetupCodes).set({ usedAt: now }).where(and(eq(staffSetupCodes.userId, userId), isNull(staffSetupCodes.usedAt)));
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: admin.id, actorRole: 'admin', action: 'staff.authenticator_reset', targetType: 'user', targetId: userId, reason, metadata: { at: now.toISOString() } });
  });
  return { ok: true, code: 'updated' };
}

export type BootstrapResult = { ok: true; setupCode: string; expiresAt: string } | { ok: false; reason: 'no_user' | 'not_staff' | 'admin_exists' | 'already_set_up' };

/**
 * Operators (the command line, with database access): a setup code for a staff member, so the very first
 * admin can set theirs up, or an admin who lost theirs when no other admin can reset it. `grantAdmin` first
 * makes them an admin, only while there is none; `reset` first removes their authenticator.
 */
export async function bootstrapSetupCode(deps: Pick<StaffAuthDeps, 'db' | 'secret'>, email: string, options: { grantAdmin?: boolean; reset?: boolean }, now: Date): Promise<BootstrapResult> {
  const [person] = await deps.db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.trim().toLowerCase())).limit(1);
  if (!person) return { ok: false, reason: 'no_user' };
  if (options.grantAdmin) {
    const [admin] = await deps.db.select({ userId: staffRoles.userId }).from(staffRoles).where(eq(staffRoles.role, 'admin')).limit(1);
    if (admin) return { ok: false, reason: 'admin_exists' };
    await deps.db.insert(staffRoles).values({ userId: person.id, role: 'admin', grantedBy: null, grantedAt: now });
    await deps.db.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action: 'staff.grant_role', targetType: 'user', targetId: person.id, reason: 'The first admin, from the command line', metadata: { role: 'admin' } });
  }
  if (!(await isStaff(deps.db, person.id))) return { ok: false, reason: 'not_staff' };
  if (options.reset) {
    await deps.db.delete(staffAuthenticators).where(eq(staffAuthenticators.userId, person.id));
    await deps.db.delete(staffSessionChecks).where(inArray(staffSessionChecks.sessionId, deps.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, person.id))));
    await deps.db.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action: 'staff.authenticator_reset', targetType: 'user', targetId: person.id, reason: 'Reset from the command line', metadata: { at: now.toISOString() } });
  } else if ((await authenticatorOf(deps.db, person.id))?.confirmedAt) {
    return { ok: false, reason: 'already_set_up' };
  }
  return { ok: true, ...(await issueSetupCode(deps, person.id, { id: null, role: 'system' }, now)) };
}
