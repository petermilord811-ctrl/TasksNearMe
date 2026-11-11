'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { routes } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { ErrorState } from '@/ui/components/feedback/error-state';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { DemoBadge } from '@/ui/components/feedback/demo-badge';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';

export function FeedbackPreview({ variant }: { variant: 'empty' | 'error' | 'skeletons' | 'demo' }) {
  const t = useTranslations('common');
  const f = useTranslations('feedback');
  const [retried, setRetried] = useState(false);
  return <main className="mx-auto max-w-content space-y-8">
    <PageHeader title={t('feedbackPreviewTitle')} description={t('feedbackPreviewDescription')} />
    {variant === 'empty' && <div className="grid gap-6 md:grid-cols-2"><EmptyState title={f('emptyTitle')} body={f('emptyBody')} action={{ label: f('emptyAction'), href: routes.app.newTask() }} /><EmptyState title={f('emptyTitle')} icon={<Inbox className="size-6" />} /></div>}
    {variant === 'error' && <div className="space-y-6"><ErrorState onRetry={() => setRetried(true)} /><p role="status">{retried ? t('retryComplete') : ''}</p><ErrorState /></div>}
    {variant === 'skeletons' && <div className="grid gap-8 md:grid-cols-2">{(['list', 'detail', 'form', 'cards'] as const).map(v => <Section key={v} title={t(`${v}Skeleton`)}><PageSkeleton variant={v} /></Section>)}</div>}
    {variant === 'demo' && <div className="flex flex-wrap gap-4"><DemoBadge /><DemoBadge label={t('demoCustomLabel')} /></div>}
  </main>;
}

