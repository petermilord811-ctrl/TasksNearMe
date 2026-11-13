import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getSavedRepliesPage } from '@/modules/support/saved-replies';
import { staffActorOf } from '@/modules/support/staff';
import { archiveSavedReplyAction, createSavedReplyAction, updateSavedReplyAction } from '@/modules/support/staff-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminSavedRepliesScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Saved replies', robots: { index: false } };

/** Saved replies staff start a case reply from: leads keep the list, everyone who works cases uses it. */
export default function AdminSavedRepliesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <SavedReplies />
    </Suspense>
  );
}

async function SavedReplies() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  return (
    <AdminSavedRepliesScreen
      data={await getSavedRepliesPage(db, staff)}
      handlers={{ onCreate: createSavedReplyAction, onUpdate: updateSavedReplyAction, onArchive: archiveSavedReplyAction }}
    />
  );
}
