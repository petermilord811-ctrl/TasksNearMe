// Temporary until the poster/helper home screens (UI-007, UI-009) are wired here.
import { EmptyState, PageHeader } from '@/ui/components';

export const metadata = { title: 'Home' };

export default function AppHomePlaceholderPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Home" />
      <EmptyState title="Your home screen is on its way" body="Tasks, bookings and messages will appear here." />
    </div>
  );
}
