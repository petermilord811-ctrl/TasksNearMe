import { useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';

export function DemoBadge({ label }: { label?: string }) {
  const t = useTranslations('feedback');
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-badge-neutral px-2.5 py-1 text-xs font-medium text-badge-neutral-foreground"><FlaskConical aria-hidden="true" className="size-3.5" />{label ?? t('demo')}</span>;
}
