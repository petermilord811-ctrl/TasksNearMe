'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult, ReportInput, ReportPageData, ReportPageHandlers } from '@/contracts';
import { ReportForm } from '@/ui/components/safety/report-dialog';

export interface ReportScreenProps {
  data: ReportPageData;
  handlers: ReportPageHandlers;
}

/** Reporting a task, a helper's profile or a review (B-059): what it's about, then the reason and details. */
export function ReportScreen(props: ReportScreenProps) {
  return <ReportContent {...props} />;
}

/** Preview seeds are separate from the application screen's contract. */
export function ReportContent({ data, handlers, initialResult, initialPending, initialValues }: ReportScreenProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialValues?: Partial<ReportInput>;
}) {
  const t = useTranslations('report');
  const router = useRouter();
  const { kind, name } = data.target;
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={data.backHref} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t(`back.${kind}`)}
    </Link>
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t(`title.${kind}`)}</h1>
      <p className="break-words font-medium">{t(`subject.${kind}`, { name })}</p>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    <section aria-labelledby="report-form-title" className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id="report-form-title" className="sr-only">{t('formTitle')}</h2>
      <ReportForm onReport={handlers.onReport} onClose={() => router.push(data.backHref)} onPendingChange={() => {}} initialResult={initialResult} initialPending={initialPending} initialValues={initialValues} />
    </section>
    <p className="text-sm text-muted-foreground">{t('urgent')}</p>
  </div>;
}
