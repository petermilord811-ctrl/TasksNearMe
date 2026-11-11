import { useTranslations } from 'next-intl';
import type { PreviewEntry } from '@/contracts';
import { jordan, sam, priya, lee } from '@/fixtures';
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
  { id: 'people/verification-badges', group: verificationCopy.preview.group, title: verificationCopy.preview.badges, render: () => <BadgesPreview /> },
  { id: 'people/ratings', group: verificationCopy.preview.group, title: verificationCopy.preview.ratings, render: () => <RatingsPreview /> },
];
