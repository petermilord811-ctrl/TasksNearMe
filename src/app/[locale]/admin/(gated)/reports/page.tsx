import { redirect } from 'next/navigation';
import { routes } from '@/contracts';

/** User and content reports are cases: the reports queue (blueprint 02 `/admin/reports`). */
export default function AdminReportsPage() {
  redirect(routes.admin.cases({ queue: 'reports' }));
}
