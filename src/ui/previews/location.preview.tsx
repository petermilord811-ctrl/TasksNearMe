import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PreviewEntry, TaskLocation } from '@/contracts';
import { DESK_TIMES, deskExactAddress, muellerArea, muellerAreaForJordan, remoteLocation } from '@/fixtures';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { GeneralArea } from '@/ui/components/location/general-area';
import locationMessages from '../../../messages/en/ui/location.json';

function LocationPreviewFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-180 space-y-6 py-4">
      <h1 className="text-2xl font-bold leading-8">{title}</h1>
      {children}
    </main>
  );
}

function LocalAreaPreview({ location, role }: { location: TaskLocation; role: 'poster' | 'helper' }) {
  const t = useTranslations('location');
  return (
    <LocationPreviewFrame title={t(role === 'poster' ? 'previews.posterTitle' : 'previews.helperTitle')}>
      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('previews.withMap')}</h2>
        <GeneralArea location={location} showMap />
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('previews.withoutMap')}</h2>
        <GeneralArea location={location} />
      </section>
    </LocationPreviewFrame>
  );
}

function RemotePreview() {
  const t = useTranslations('location');
  return (
    <LocationPreviewFrame title={t('previews.remoteTitle')}>
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <GeneralArea location={remoteLocation} showMap />
      </div>
    </LocationPreviewFrame>
  );
}

function ExactAddressPreview() {
  const t = useTranslations('location');
  return (
    <LocationPreviewFrame title={t('previews.exactTitle')}>
      <ExactAddressPanel address={deskExactAddress} visibleUntil={DESK_TIMES.addressHidden} />
    </LocationPreviewFrame>
  );
}

export const locationPreviews: PreviewEntry[] = [
  {
    id: 'location/general-area-poster',
    group: locationMessages.previews.locationGroup,
    title: locationMessages.previews.posterTitle,
    render: () => <LocalAreaPreview location={muellerArea} role="poster" />,
  },
  {
    id: 'location/general-area-helper',
    group: locationMessages.previews.locationGroup,
    title: locationMessages.previews.helperTitle,
    render: () => <LocalAreaPreview location={muellerAreaForJordan} role="helper" />,
  },
  {
    id: 'location/remote',
    group: locationMessages.previews.locationGroup,
    title: locationMessages.previews.remoteTitle,
    render: () => <RemotePreview />,
  },
  {
    id: 'location/exact-address',
    group: locationMessages.previews.locationGroup,
    title: locationMessages.previews.exactTitle,
    notes: locationMessages.previews.exactNote,
    render: () => <ExactAddressPreview />,
  },
];
