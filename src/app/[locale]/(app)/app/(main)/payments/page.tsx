import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { addCardAction, makeDefaultCardAction, removeCardAction } from '@/modules/earnings/actions';
import { getPaymentsPage } from '@/modules/earnings/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { PaymentsScreen } from '@/ui/screens/money';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('payments');
}

/** The client's receipts and saved cards. */
function PaymentsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Payments />
    </Suspense>
  );
}

async function Payments() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.payments()));
  const now = await requestNow();
  const data = await getPaymentsPage(db, viewer.user.id);
  return (
    <PaymentsScreen
      data={data}
      now={now.toISOString()}
      handlers={{ onAddCard: addCardAction, onRemoveCard: removeCardAction, onMakeDefault: makeDefaultCardAction }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/payments/page.tsx', PaymentsPage);
