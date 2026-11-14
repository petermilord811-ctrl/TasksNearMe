import { MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { InboxPageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InboxList } from '@/ui/components/messaging/inbox-list';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

export interface InboxScreenProps {
  data: InboxPageData;
  now: ISODateTime;
}

/**
 * Messages: one row per conversation, newest first, with filters (all, unread, offers, bookings) and a search
 * that answer as you type (completion plan 7.3). The person and how long ago on the first line, the kind, the
 * task and anything unread under it, then the last message. Unread conversations read a little stronger.
 */
export function InboxScreen({ data, now }: InboxScreenProps) {
  const t = useTranslations('inbox');

  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.threads.length === 0 ? <div className="space-y-3">
      <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<MessagesSquare className="size-6" />} action={{ label: t('viewTasks'), href: routes.app.tasks() }} />
      <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>
    </div> : <InboxList threads={data.threads} now={now} />}
  </div>;
}
