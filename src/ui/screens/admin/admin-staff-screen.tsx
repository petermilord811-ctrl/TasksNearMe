import { useTranslations } from 'next-intl';
import type { AdminStaffHandlers, AdminStaffPageData, ISODateTime } from '@/contracts';
import { AdminStaffControls, type AdminStaffPreviewState } from './admin-staff-controls';

export interface AdminStaffScreenProps { data: AdminStaffPageData; handlers: AdminStaffHandlers; now: ISODateTime }

export function AdminStaffScreen(props: AdminStaffScreenProps) { return <AdminStaffContent {...props} />; }

/** Admins: staff members and their roles; add or remove a role with a reason (UI-037). */
export function AdminStaffContent({ data, handlers, now, ...preview }: AdminStaffScreenProps & AdminStaffPreviewState) {
  const t = useTranslations('adminStaff');
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
      <p className="text-sm text-muted-foreground">{t('rules')}</p>
    </header>
    <AdminStaffControls data={data} handlers={handlers} now={now} {...preview} />
  </div>;
}
