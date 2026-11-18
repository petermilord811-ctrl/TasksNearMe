import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getInbox } from '@/modules/messaging/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { InboxScreen } from '@/ui/screens/messages';
import { requestNow } from '@/platform/clock';
import { InboxSkeleton } from '@/ui/screens/messages/inbox-skeleton';

export const metadata: Metadata = { title: 'Messages', robots: { index: false } };

/** The viewer's conversations, latest activity first. */
function MessagesPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.messages()));
  const now = await requestNow();
  const data = await getInbox(db, viewer.user.id, now);
  return <InboxScreen data={data} now={now.toISOString()} />;
}

// The list's filters and search run in the browser (completion plan 7.3): it needs its copy there.
export default withClientMessages('[locale]/(app)/app/(main)/messages/page.tsx', MessagesPage);
