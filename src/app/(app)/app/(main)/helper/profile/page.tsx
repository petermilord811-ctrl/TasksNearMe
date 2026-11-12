import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { removeProfilePhotoAction, uploadProfilePhotoAction } from '@/modules/accounts/account-actions';
import {
  editorRemoveWorkSample,
  editorReorderWorkSamples,
  editorSaveArea,
  editorSaveProfile,
  editorSaveServices,
  editorSaveTools,
  editorSetPaused,
  editorUpdateWorkSample,
  editorUploadWorkSample,
} from '@/modules/verification/actions';
import { getProfileEditorData } from '@/modules/verification/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HelperProfileEditorScreen } from '@/ui/screens/helper';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Your helper profile', robots: { index: false } };

/** Everything a helper can change after onboarding. No profile yet: start onboarding. */
export default function HelperProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Editor />
    </Suspense>
  );
}

async function Editor() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helperProfile()));
  const data = await getProfileEditorData(db, viewer.user.id, await requestNow());
  if (!data) redirect(routes.app.helperOnboarding());
  return (
    <HelperProfileEditorScreen
      data={data}
      handlers={{
        onSaveProfile: editorSaveProfile,
        onSaveServices: editorSaveServices,
        onSaveArea: editorSaveArea,
        onSaveTools: editorSaveTools,
        onUploadWorkSample: editorUploadWorkSample,
        onUpdateWorkSample: editorUpdateWorkSample,
        onRemoveWorkSample: editorRemoveWorkSample,
        onReorderWorkSamples: editorReorderWorkSamples,
        onSetPaused: editorSetPaused,
        onUploadPhoto: uploadProfilePhotoAction,
        onRemovePhoto: removeProfilePhotoAction,
      }}
    />
  );
}
