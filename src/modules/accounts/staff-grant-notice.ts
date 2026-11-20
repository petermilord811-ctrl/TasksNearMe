import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { localeOrDefault } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import type { Db } from '@/platform/db/connect';
import { renderStaffRoleGrantedEmail } from './emails/staff-role';
import { staffRoles, users } from './schema';
import type { StaffGrantAnnouncement } from './staff-roles';

/**
 * Every admin hears of a staff role that took effect (security review SEC19), the newly made admin included, by email
 * in their own language. A notice never fails the grant it reports.
 */
export async function announceStaffGrant(deps: { db: Db; email: EmailProvider; appUrl: string }, grant: StaffGrantAnnouncement): Promise<number> {
  try {
    const adminIds = (await deps.db.select({ userId: staffRoles.userId }).from(staffRoles).where(eq(staffRoles.role, 'admin'))).map((row) => row.userId);
    const ids = [...new Set([...adminIds, grant.userId, grant.grantedById, ...(grant.approvedById ? [grant.approvedById] : [])])];
    const people = await deps.db.select({ id: users.id, name: users.name, email: users.email, locale: users.locale, status: users.status }).from(users).where(inArray(users.id, ids));
    const byId = new Map(people.map((person) => [person.id, person]));
    const person = byId.get(grant.userId);
    if (!person) return 0;
    let sent = 0;
    for (const adminId of adminIds) {
      const admin = byId.get(adminId);
      if (!admin || admin.status === 'deleted') continue;
      const rendered = renderStaffRoleGrantedEmail({
        person: person.name || person.email,
        email: person.email,
        role: grant.role,
        grantedBy: byId.get(grant.grantedById)?.name ?? '',
        ...(grant.approvedById ? { approvedBy: byId.get(grant.approvedById)?.name ?? '' } : {}),
        reason: grant.reason,
        appUrl: deps.appUrl,
        locale: localeOrDefault(admin.locale),
      });
      try {
        await deps.email.send({ to: admin.email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'staff-role-granted' });
        sent += 1;
      } catch (error) {
        console.error('[staff-role-granted]', error);
      }
    }
    return sent;
  } catch (error) {
    console.error('[staff-role-granted]', error);
    return 0;
  }
}
