import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * A signed-in page that can't open for this account (2026-11-23; it bounced to Home without a word, which read as a
 * broken link): Neighbors, a new post, Plans and Post a task when the account is missing what they need, such as its
 * home city. It says so, with the way home and to support.
 */
export function PageUnavailableScreen() {
  const t = useTranslations('notFound.unavailable');
  return <div className="mx-auto max-w-reading space-y-4 py-6">
    <EmptyState icon={<CircleAlert />} title={t('title')} body={t('body')} action={{ label: t('home'), href: routes.app.home() }} />
    <p className="text-center text-sm text-muted-foreground"><Link href={routes.app.support()} className="font-medium text-primary underline underline-offset-4">{t('help')}</Link></p>
  </div>;
}
