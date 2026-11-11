'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PhotoUploadResult } from '@/contracts';
import { deskCompletionView, deskReportProblemPageData, fakeCompletionHandlers, fakeHandler } from '@/fixtures';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';

export type UploadError = Extract<PhotoUploadResult, { ok: false }>['code'];

/** Controlled uploader, including a seeded error that remains reproducible when a photo is selected. */
export function EvidencePhotoPickerPreview({ uploadError }: { uploadError?: UploadError }) {
  const t = useTranslations('reportProblem');
  const photosCopy = useTranslations('bookingComplete.photos');
  const [photos, setPhotos] = useState(uploadError ? [] : deskCompletionView.photos);
  const megabytes = deskReportProblemPageData.maxPhotoMegabytes;
  return <div className="mx-auto max-w-reading rounded-xl border bg-card p-4 shadow-card sm:p-6">
    <EvidencePhotoPicker
      id="preview-evidence-photos"
      label={t('photos')}
      hint={t('photosHint', { megabytes })}
      photos={photos}
      onChange={setPhotos}
      maxPhotos={6}
      maxPhotoMegabytes={megabytes}
      error={uploadError ? photosCopy(`errors.${uploadError}`, { maximum: 6, megabytes }) : undefined}
      onUploadPhoto={uploadError ? async () => {
        await fakeHandler()(undefined);
        return { ok: false, code: uploadError };
      } : fakeCompletionHandlers.onUploadPhoto}
    />
  </div>;
}
