import 'server-only';
import { cookies } from 'next/headers';
import type { AppLocale, StaffRole } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { NEIGHBORS_SAMPLES_COOKIE, neighborsRowScope } from './samples';
import type { CommunityViewer } from './service';

/**
 * The signed-in person as Neighbors reads for them on this request (pages and Server Actions only: it reads the
 * request's cookies): staff after their two-step check, which rows they see (plan 10, D1; staff's demo switch is a
 * cookie), and the page's language.
 */
export async function communityViewerOf(user: { id: string; staffRoles: StaffRole[]; staffTwoStepVerified: boolean }, locale?: AppLocale): Promise<CommunityViewer> {
  const staff = staffActorOf(user);
  const store = await cookies();
  const rows = neighborsRowScope({ id: user.id, staff: staff !== null }, store.get(NEIGHBORS_SAMPLES_COOKIE)?.value);
  return { id: user.id, staff, rows, ...(locale ? { locale } : {}) };
}
