import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { routes } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { staffRoles, users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import type { StoredIdentityAutoCheck } from './schema';

/**
 * Tells the staff who decide ID checks that a reading is ready, and how it compared with the account (owner,
 * 2026-11-21: "check it's matched with current user's name and address or birthday ... and notify me"). One email per
 * reading to every active trust and safety member, support lead and admin. Like on-call pages, it carries no personal
 * details (no name, birth date, number or address), only the answers and a link to the person's staff page. Test
 * accounts' readings send nothing.
 */

const DECIDER_ROLES = ['trust_safety', 'support_lead', 'admin'];

export interface IdReadingNotice {
  userId: string;
  captureId: string;
  check: StoredIdentityAutoCheck;
}

const yesNo = (value: boolean | undefined, unknown = 'not read') => (value === undefined ? unknown : value ? 'yes' : 'no');

/** The subject's short verdict: everything matched, or what didn't. */
export function readingVerdict(check: StoredIdentityAutoCheck): string {
  if (!check.readable) return "couldn't be read automatically";
  const off = [
    check.nameMatches === false && 'name',
    check.addressMatches === false && 'address',
    check.isAdult === false && 'under 18',
    check.notExpired === false && 'expired',
    check.frontAgrees === false && "front and barcode differ",
  ].filter((item): item is string => Boolean(item));
  return off.length === 0 ? 'everything read matches' : `check: ${off.join(', ')}`;
}

/** The email's lines: the answers only. */
export function readingEmailText(check: StoredIdentityAutoCheck, link: string): string {
  const lines = !check.readable
    ? ["The automatic reading couldn't read this ID. Open the photos to check it yourself."]
    : [
        `Read from: ${check.source === 'barcode' ? 'the barcode on the back' : check.source === 'mrz' ? "the passport's machine-readable zone" : check.source === 'front' ? "the front's print" : 'the ID'}`,
        `Name matches the account's legal name: ${yesNo(check.nameMatches)}`,
        `Address matches the home address on file: ${yesNo(check.addressMatches, 'no address to compare')}`,
        `18 or older: ${yesNo(check.isAdult)}`,
        `Not expired: ${yesNo(check.notExpired)}`,
        ...(check.frontAgrees !== undefined ? [`Front and barcode agree: ${yesNo(check.frontAgrees)}`] : []),
      ];
  return [...lines, '', `Review it (the details and photos open with a logged reason): ${link}`].join('\n');
}

export async function notifyDecidersOfIdReading(db: Db, email: EmailProvider, notice: IdReadingNotice, appUrl: string): Promise<number> {
  const staff = await db
    .selectDistinct({ email: users.email })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    // A suspended or banned staff member gets nothing, and nobody hears about their own reading.
    .where(and(inArray(staffRoles.role, DECIDER_ROLES), isNotNull(users.email), eq(users.status, 'active'), ne(users.id, notice.userId)));
  const link = `${appUrl.replace(/\/$/, '')}${routes.admin.user(notice.userId)}`;
  const subject = `ID ready for review: ${readingVerdict(notice.check)}`;
  const text = readingEmailText(notice.check, link);
  let sent = 0;
  for (const { email: to } of staff) {
    if (!to) continue;
    try {
      await email.send({ to, subject, text, tag: 'id-reading' });
      sent += 1;
    } catch (error) {
      // One address failing doesn't keep the others from hearing; the queue still shows the reading.
      console.error('[id-reading] email failed:', error instanceof Error ? error.name : 'error');
    }
  }
  return sent;
}
