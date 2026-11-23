import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getReceiptPage } from '@/modules/earnings/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ReceiptDialogScreen } from '@/ui/screens/money';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('receipt');
}

/**
 * A booking's receipt over the payments list (2026-11-23, owner: "I hate to redirect to new pages continually"; the full
 * page, printable on its own: (app)/app/(main)/payments/[bookingId]), for its client only.
 */
function ReceiptDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.receipt(bookingId)));
  const data = await getReceiptPage(db, viewer.user.id, bookingId);
  if (!data) notFound();
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ReceiptDialogScreen data={data} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/payments/[bookingId]/page.tsx', ReceiptDialogPage);
