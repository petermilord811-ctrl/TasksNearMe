import { useTranslations } from 'next-intl';
import type { AdminStaffHandlers, AdminStaffPageData, ISODateTime } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { AdminStaffControls, type AdminStaffPreviewState } from './admin-staff-controls';

export interface AdminStaffScreenProps { data: AdminStaffPageData; handlers: AdminStaffHandlers; now: ISODateTime }

export function AdminStaffScreen(props: AdminStaffScreenProps) { return <AdminStaffContent {...props} />; }

/** Admins: staff members and their roles; add or remove a role with a reason (UI-037). */
export function AdminStaffContent({ data, handlers, now, ...preview }: AdminStaffScreenProps & AdminStaffPreviewState) {
  const t = useTranslations('adminStaff');
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <div className="space-y-3">
      <PageHeader title={t('title')} description={t('intro')} />
      <p className="max-w-2xl rounded-xl bg-foreground/[0.035] px-3.5 py-2.5 text-sm text-muted-foreground dark:bg-white/[0.04]">{t('rules')}</p>
    </div>
    <AdminStaffControls data={data} handlers={handlers} now={now} {...preview} />
  </div>;
}
