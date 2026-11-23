import { redirect } from 'next/navigation';
import { routes } from '@/contracts/routes';

/**
 * The bell's dialog (`routes.app.recentNotifications`, src/app/[locale]/@modal), loaded on its own: the notifications
 * page.
 */
export default function RecentNotificationsPage(): never {
  redirect(routes.app.notifications());
}
