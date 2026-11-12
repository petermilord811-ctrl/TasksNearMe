import { useTranslations } from 'next-intl';
import type { PreviewEntry, PublicReviewView } from '@/contracts';
import { samProfilePageData } from '@/fixtures';
import { ReviewCard } from '@/ui/components/reviews/review-card';
import { WorkSampleGallery } from '@/ui/components/people/work-sample-gallery';
import copy from '../../../messages/en/ui/reviews.json';

function ReviewPreview({ review, variant }: { review: PublicReviewView; variant: 'full' | 'tagsOnly' }) {
  const t = useTranslations('reviews');
  return <main className="mx-auto max-w-reading space-y-6"><h1 className="text-2xl font-bold">{t(`preview.${variant}`)}</h1><ReviewCard review={review} /></main>;
}

function WorkSamplesPreview() {
  const t = useTranslations('reviews');
  return <main className="mx-auto max-w-content space-y-6"><h1 className="text-2xl font-bold">{t('preview.three')}</h1><WorkSampleGallery samples={samProfilePageData.workSamples} eagerFirst /></main>;
}

export const reviewsWorkSamplesPreviews: PreviewEntry[] = [
  { id: 'review-card/full', group: copy.preview.reviewsGroup, title: copy.preview.full, render: () => <ReviewPreview review={samProfilePageData.reviews[0]!} variant="full" /> },
  { id: 'review-card/tags-only', group: copy.preview.reviewsGroup, title: copy.preview.tagsOnly, render: () => <ReviewPreview review={samProfilePageData.reviews[2]!} variant="tagsOnly" /> },
  { id: 'work-samples/three', group: copy.preview.samplesGroup, title: copy.preview.three, render: () => <WorkSamplesPreview /> },
];
