import { useTranslations } from 'next-intl';
import type { PreviewEntry } from '@/contracts';
import { jordan, jordanProfilePhoto, sam, samProfilePhoto, priya, lee } from '@/fixtures';
import { PhotoCropDialog } from '@/ui/components/forms/photo-crop-dialog';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { RatingStars } from '@/ui/components/people/rating-stars';
import verificationCopy from '../../../messages/en/ui/verification.json';

function AvatarsPreview() {
  const t = useTranslations('verification');
  const sizes = [{ size: 'sm', label: 'small' }, { size: 'md', label: 'medium' }, { size: 'lg', label: 'large' }] as const;

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('preview.avatars')}</h1>
      {sizes.map(({ size, label }) => (
        <section key={size} className="space-y-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{t(`preview.${label}`)}</h2>
          <div className="flex flex-wrap gap-6">
            {[jordan, sam, priya, lee].map((person) => (
              <div key={person.id} className="space-y-2">
                <InitialsAvatar initials={person.initials} size={size} />
                <p className="text-sm">{person.displayName}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

/** Profile photos at every size, and one whose file is gone: it shows the initials (plan 9.3). */
function AvatarPhotosPreview() {
  const t = useTranslations('verification');
  const missing = { id: 'fil_missing', src: '/api/files/fil_missing?w=256', alt: 'Lee M.', width: 256, height: 256 };
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('preview.avatarPhotos')}</h1>
      <section className="flex flex-wrap items-end gap-6 rounded-xl border border-border bg-card p-4">
        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => <InitialsAvatar key={size} initials={jordan.initials} photo={jordanProfilePhoto} size={size} />)}
        <InitialsAvatar initials={sam.initials} photo={samProfilePhoto} size="lg" />
      </section>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('preview.photoMissing')}</h2>
        <InitialsAvatar initials={lee.initials} photo={missing} size="lg" />
      </section>
    </main>
  );
}

const noop = () => undefined;

function BadgesPreview() {
  const t = useTranslations('verification');
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('preview.badges')}</h1>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('preview.all')}</h2>
        <VerificationBadges badges={jordan.badges} />
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('preview.some')}</h2>
        <VerificationBadges badges={priya.badges} />
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('preview.none')}</h2>
        <VerificationBadges badges={{ ...priya.badges, phoneVerified: false }} />
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('preview.compact')}</h2>
        <VerificationBadges badges={sam.badges} compact />
      </section>
    </main>
  );
}

function RatingsPreview() {
  const t = useTranslations('verification');
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('preview.ratings')}</h1>
      {[sam, lee, jordan].map((person) => (
        <section key={person.id} className="space-y-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{person.displayName}</h2>
          <RatingStars rating={person.rating} />
        </section>
      ))}
    </main>
  );
}

export const peoplePreviews: PreviewEntry[] = [
  { id: 'people/avatars', group: verificationCopy.preview.group, title: verificationCopy.preview.avatars, render: () => <AvatarsPreview /> },
  { id: 'people/avatar-photos', group: verificationCopy.preview.group, title: verificationCopy.preview.avatarPhotos, render: () => <AvatarPhotosPreview /> },
  // The adjust step after choosing a photo (plan 9.3): a wide photo, centred, in the round frame.
  { id: 'people/photo-adjust', group: verificationCopy.preview.group, title: verificationCopy.preview.photoAdjust, layout: 'fullscreen', render: () => <PhotoCropDialog image={{ src: '/samples/photo-wide.svg', width: 1200, height: 800 }} onCancel={noop} onConfirm={noop} onChooseAnother={noop} /> },
  { id: 'people/verification-badges', group: verificationCopy.preview.group, title: verificationCopy.preview.badges, render: () => <BadgesPreview /> },
  { id: 'people/ratings', group: verificationCopy.preview.group, title: verificationCopy.preview.ratings, render: () => <RatingsPreview /> },
];
