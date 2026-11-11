import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type NotificationHandlers, type NotificationsPageData } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { NotificationList, MarkAllRead } from './notification-actions';

export function NotificationsScreen({ data, handlers, now }: {
  data: NotificationsPageData;
  handlers: NotificationHandlers;
  now: ISODateTime;
}) {
  const t = useTranslations('notifications');
  const notifications = [...data.notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return <div className="mx-auto w-full max-w-[1120px] space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    <MarkAllRead onMarkAllRead={handlers.onMarkAllRead} hasUnread={data.unreadCount > 0} />
    {notifications.length > 0
      ? <NotificationList notifications={notifications} onOpen={handlers.onOpen} now={now} />
      : <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<Bell className="size-6" />} action={{ label: t('empty.action'), href: routes.app.home() }} />}
  </div>;
}
