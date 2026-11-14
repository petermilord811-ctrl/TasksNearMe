import { useTranslations } from 'next-intl';
import type { AdminCaseRow } from '@/contracts';

/** Who opened a case: the member, or a public request's address with where it came from (5.22). */
export function AdminCaseOpener({ item }: { item: Pick<AdminCaseRow, 'openedBy' | 'contact'> }) {
  const t = useTranslations('adminCases');
  if (item.openedBy) return <>{item.openedBy.displayName}</>;
  if (!item.contact) return null;
  return <>
    <span className="block [overflow-wrap:anywhere]">{item.contact.email}</span>
    <span className="block text-xs text-muted-foreground">{t('contactForm')}</span>
  </>;
}
