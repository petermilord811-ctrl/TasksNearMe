// Temporary until the sign-in screens (UI-004) are wired here.
import { EmptyState, PageHeader } from '@/ui/components';

export const metadata = { title: 'Sign in' };

export default function SignInPlaceholderPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Sign in" />
      <EmptyState
        title="Sign-in screens are on their way"
        body="In development, use /dev/sign-in to sign in as one of the sample people."
      />
    </div>
  );
}
