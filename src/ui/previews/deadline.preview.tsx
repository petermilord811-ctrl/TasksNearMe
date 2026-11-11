import { useTranslations } from 'next-intl';
import type { ISODateTime, PreviewEntry } from '@/contracts';
import { DESK_TIMES } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import { Deadline } from '@/ui/components/time/deadline';
import moneyCopy from '../../../messages/en/ui/money.json';

function DeadlinePreview({ now, variant, tone }: { now: ISODateTime; variant: 'upcoming' | 'soon' | 'passed'; tone: 'neutral' | 'warning' | 'danger' }) {
  const t = useTranslations('money');
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t(`preview.${variant}`)}</h1>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <Deadline at={DESK_TIMES.approvalDue} now={now} label={t('approvalDue')} tone={tone} />
        <p className="text-sm leading-6 text-muted-foreground">{t('approvalExplanation', { deadline: formatDateTime(DESK_TIMES.approvalDue) })}</p>
      </section>
    </main>
  );
}

export const deadlinePreviews: PreviewEntry[] = [
  {
    id: 'deadline/upcoming', group: moneyCopy.preview.deadlineGroup, title: moneyCopy.preview.upcoming,
    render: () => <DeadlinePreview now={DESK_TIMES.completionSubmitted} variant="upcoming" tone="neutral" />,
  },
  {
    id: 'deadline/soon', group: moneyCopy.preview.deadlineGroup, title: moneyCopy.preview.soon,
    render: () => <DeadlinePreview now="2026-11-24T17:18:00.000Z" variant="soon" tone="warning" />,
  },
  {
    id: 'deadline/passed', group: moneyCopy.preview.deadlineGroup, title: moneyCopy.preview.passed,
    render: () => <DeadlinePreview now="2026-11-24T18:18:00.000Z" variant="passed" tone="danger" />,
  },
];
