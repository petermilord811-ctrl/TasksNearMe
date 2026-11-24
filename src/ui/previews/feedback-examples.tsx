'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { routes } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { ErrorState } from '@/ui/components/feedback/error-state';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { DemoBadge } from '@/ui/components/feedback/demo-badge';
import { PushToastCard } from '@/ui/components/feedback/push-toasts';
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

/**
 * Pushes while a page is in front (owner, 2026-11-24), as the toaster shows them: a card in the toaster's frame (its
 * rounded popover look comes from AppToaster's toast classes), with a long sentence and a short one.
 */
export function PushToastExamples() {
  const frame = 'w-[min(100%,356px)] rounded-2xl border border-foreground/[0.08] bg-popover text-popover-foreground shadow-overlay dark:border-white/[0.08]';
  return <div className="flex flex-col items-end gap-3">
    <div className={frame}><PushToastCard push={{ title: 'New message from Maya R.', body: 'Maya R.: Can you come a little earlier, around 2:30? The movers moved our slot and the boxes need to be out of the hall by four.' }} path={routes.app.messages()} onDismiss={() => undefined} /></div>
    <div className={frame}><PushToastCard push={{ title: 'Booking confirmed', body: '' }} path={routes.app.bookings()} onDismiss={() => undefined} /></div>
  </div>;
}
