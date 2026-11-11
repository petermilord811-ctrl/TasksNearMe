import { useTranslations } from 'next-intl';
import type { AdminHelperStatus, BadgeTone, StaffRole } from '@/contracts';
import { StatusBadge } from '@/ui/components/status/status-badge';

const helperTones: Record<AdminHelperStatus, BadgeTone> = { none: 'neutral', draft: 'info', active: 'success', paused: 'warning', suspended: 'danger' };

export function AdminHelperBadge({ status }: { status: AdminHelperStatus }) {
  const t = useTranslations('adminUsers');
  return <StatusBadge label={t(`helperStatuses.${status}`)} tone={helperTones[status]} />;
}

export function AdminUserRoles({ roles }: { roles: StaffRole[] }) {
  const t = useTranslations('adminUsers');
  const shell = useTranslations('shell.roles');
  return roles.length > 0
    ? <span className="flex flex-wrap gap-1.5">{roles.map((role) => <StatusBadge key={role} label={shell(role)} tone="neutral" />)}</span>
    : <span className="text-sm text-muted-foreground">{t('noStaffRoles')}</span>;
}
