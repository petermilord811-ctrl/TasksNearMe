import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type PaymentAttemptResult, type RequestHelperHandlers, type RequestHelperPageData } from '@/contracts';
import { RequestHelperForm } from './request-helper-form';

export interface RequestHelperScreenProps {
  data: RequestHelperPageData;
  handlers: RequestHelperHandlers;
  now: ISODateTime;
}

export function RequestHelperScreen(props: RequestHelperScreenProps) {
  return <RequestHelperContent {...props} />;
}

/** Initial results are for previews; app pages use RequestHelperScreen. */
export function RequestHelperContent({ data, handlers, initialResult, initialPending }: RequestHelperScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('invites');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.helperProfile(data.helper.handle)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t('back', { helper: data.helper.displayName })}
    </Link>
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title', { helper: data.helper.displayName })}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    {data.tasks.length === 0 ? <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold">{t('noTasksTitle')}</h2>
      <p className="text-muted-foreground">{t('noTasksDescription')}</p>
      <Link href={routes.app.newTask()} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('postTask')}</Link>
    </section> : <RequestHelperForm key={data.helper.id} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />}
  </div>;
}
