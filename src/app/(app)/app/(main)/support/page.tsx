import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { uploadEvidencePhoto } from '@/modules/bookings/completion-actions';
import { createSupportRequestAction } from '@/modules/support/actions';
import { getSupportPage } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SupportScreen } from '@/ui/screens/support';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };

/** The member's cases (open first) and a new request. */
export default function SupportPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Support />
    </Suspense>
  );
}

async function Support() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.support()));
  const data = await getSupportPage(db, viewer.user.id);
  return <SupportScreen data={data} now={new Date().toISOString()} handlers={{ onCreate: createSupportRequestAction, onUploadPhoto: uploadEvidencePhoto }} />;
}
