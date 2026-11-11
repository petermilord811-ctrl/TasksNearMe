import type { PreviewEntry } from '@/contracts';
import { useTranslations } from 'next-intl';
import { deskTimelineCompleted } from '@/fixtures';
import { Timeline } from '@/ui/components/timeline/timeline';
import timelineCopy from '../../../messages/en/ui/timeline.json';

function TimelinePreview() {
  const t = useTranslations('timeline');
  return <main className="mx-auto max-w-2xl space-y-6"><h1 className="font-heading text-2xl font-bold">{t('previewTitle')}</h1><div className="rounded-xl border bg-card p-5"><Timeline events={deskTimelineCompleted} /></div></main>;
}

export const timelinePreviews: PreviewEntry[] = [
  { id: 'timeline/desk-completed', group: timelineCopy.previewGroup, title: timelineCopy.previewTitle, render: () => <TimelinePreview /> },
];
