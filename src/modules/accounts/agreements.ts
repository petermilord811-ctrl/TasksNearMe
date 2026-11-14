import { and, eq } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { agreements } from './schema';

/**
 * Agreements and consents (blueprint 08 `agreements`). Bump a version when its text changes materially:
 * people accept the new one the next time it matters (the helper agreement on the profile step, the
 * biometric notice before an ID check, the disclosure before a background check).
 */
export const AGREEMENT_VERSIONS = {
  /** Independent-contractor terms and the community guidelines (`/legal/helper-agreement`). */
  helper_agreement: 'draft-0.1',
  /**
   * The Texas biometric notice (Bus. & Com. Code §503.001), accepted before the ID check. draft-0.2
   * (2026-11-13): a helper's check has two stages, our own photos of the ID and a selfie (compared by our
   * team, kept encrypted until the checks finish and deleted at most 30 days after our decision), then the
   * provider's double check; a client's check is the provider's alone. draft-0.3 (2026-11-13): the
   * provider is Persona (completion plan 6.2), which keeps its images and is asked to delete them 30 days
   * after its result.
   */
  biometric_consent: 'draft-0.3',
  /** Our summary of the background check, before Checkr's own FCRA disclosure and authorization. */
  bg_check_disclosure: 'draft-0.1',
} as const;
export type AgreementDoc = keyof typeof AGREEMENT_VERSIONS;

/** Where an agreement was accepted from (kept with it). */
export interface RequestOrigin {
  ip?: string | null;
  userAgent?: string | null;
}

/** Records the current version of `doc` as accepted (once; accepting again changes nothing). */
export async function recordAgreement(db: Db, userId: string, doc: AgreementDoc, origin: RequestOrigin, now: Date): Promise<void> {
  await db
    .insert(agreements)
    .values({
      id: newId('agr'),
      userId,
      doc,
      version: AGREEMENT_VERSIONS[doc],
      acceptedAt: now,
      ip: origin.ip?.slice(0, 64) ?? null,
      userAgent: origin.userAgent?.slice(0, 300) ?? null,
    })
    .onConflictDoNothing();
}

/** When each document's current version was accepted (documents not accepted in their current version are absent). */
export async function currentAgreements(db: Db, userId: string): Promise<Partial<Record<AgreementDoc, Date>>> {
  const rows = await db.select({ doc: agreements.doc, version: agreements.version, acceptedAt: agreements.acceptedAt }).from(agreements).where(eq(agreements.userId, userId));
  const accepted: Partial<Record<AgreementDoc, Date>> = {};
  for (const row of rows) {
    const doc = row.doc as AgreementDoc;
    if (AGREEMENT_VERSIONS[doc] === row.version) accepted[doc] = row.acceptedAt;
  }
  return accepted;
}

export async function hasAgreement(db: Db, userId: string, doc: AgreementDoc): Promise<boolean> {
  const [row] = await db
    .select({ id: agreements.id })
    .from(agreements)
    .where(and(eq(agreements.userId, userId), eq(agreements.doc, doc), eq(agreements.version, AGREEMENT_VERSIONS[doc])))
    .limit(1);
  return row !== undefined;
}

/** The request's origin from Next's headers (the first forwarded address, then the browser). */
export function originFromHeaders(headers: Headers): RequestOrigin {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return { ip: forwarded || headers.get('x-real-ip'), userAgent: headers.get('user-agent') };
}
