// Temporary until the home screen (UI-003) is wired here. The shell provides <main>.
import { EmptyState, PageHeader } from '@/ui/components';

export default function HomePlaceholderPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="TasksNearMe" description="Book trusted local help for everyday tasks in Austin." />
      <EmptyState title="The public site is on its way" body="UI previews are at /dev/ui; sample sign-ins at /dev/sign-in." />
    </div>
  );
}
