import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, CircleAlert, LifeBuoy } from 'lucide-react';
import { routes, type ActionResult, type ISODateTime, type SupportCaseRow, type SupportHandlers, type SupportPageData } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { NewSupportRequestForm } from './new-support-request-form';

export interface SupportScreenProps {
  data: SupportPageData;
  handlers: SupportHandlers;
  now: ISODateTime;
}

function CaseRow({ item, now }: { item: SupportCaseRow; now: ISODateTime }) {
  const t = useTranslations('support');
  const status = useCaseStatus(item.status, item.viewerRole);
  return <li>
    <Link href={routes.app.supportCase(item.id)} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:bg-accent sm:p-5">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t(`kinds.${item.kind}`)}</span>
          {item.unread && <span className="inline-flex items-center gap-1.5 font-medium text-primary"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />{t('unread')}</span>}
        </div>
        <h3 className="break-words font-heading text-[17px]/6 font-semibold sm:text-lg">{item.subject}</h3>
        <StatusBadge {...status} />
        <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time></p>
        <p className="text-sm tabular-nums text-muted-foreground">{t('updated', { relative: formatRelative(item.updatedAt, now) })}</p>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  </li>;
}

export function SupportScreen(props: SupportScreenProps) {
  return <SupportContent {...props} />;
}

/** Seeded interaction states are used only by the preview gallery. */
export function SupportContent({ data, handlers, now, initialResult, initialPending }: SupportScreenProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('support');
  return <div className="mx-auto max-w-reading space-y-8">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    <section aria-label={t('cases')} className="space-y-4">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('cases')}</h2>
      {data.cases.length > 0
        ? <ul className="space-y-3">{data.cases.map((item) => <CaseRow key={item.id} item={item} now={now} />)}</ul>
        : <EmptyState headingLevel={3} title={t('emptyTitle')} body={t('emptyBody')} icon={<LifeBuoy className="size-6" />} />}
    </section>
    <aside className="flex flex-wrap items-center gap-x-2 rounded-xl border border-warning/40 bg-badge-warning px-4 py-2 text-badge-warning-foreground">
      <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
      <p>{t('safetyNote')}</p>
      <a href="tel:911" className="inline-flex min-h-11 items-center rounded-md font-semibold underline underline-offset-4">{t('emergencyCall')}</a>
    </aside>
    <section aria-label={t('newRequest')} className="space-y-4">
      <div className="space-y-2">
        <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('newRequest')}</h2>
        <p className="text-muted-foreground">{t('requestHint')}</p>
      </div>
      <NewSupportRequestForm data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />
    </section>
  </div>;
}
