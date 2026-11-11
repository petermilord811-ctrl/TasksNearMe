import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getReceiptPage } from '@/modules/earnings/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ReceiptScreen } from '@/ui/screens/money';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false } };

/** A printable receipt for one booking, for its client only. */
export default function ReceiptPage({ params }: PageProps<'/app/payments/[bookingId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: Pick<PageProps<'/app/payments/[bookingId]'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.receipt(bookingId)));
  const data = await getReceiptPage(db, viewer.user.id, bookingId);
  if (!data) notFound();
  return <ReceiptScreen data={data} />;
}
