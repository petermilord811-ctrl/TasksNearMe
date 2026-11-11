// Temporary until the admin queues screen (UI-018) is wired here.
import { EmptyState, PageHeader } from '@/ui/components';

export const metadata = { title: 'Staff' };

export default function AdminHomePlaceholderPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Queues" />
      <EmptyState title="Queues are on their way" body="Disputes, reports and payment issues will appear here." />
    </div>
  );
}
