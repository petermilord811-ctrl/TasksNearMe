import { MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HelpSummary, InboxPageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { HelpRow } from '@/ui/components/messaging/help-row';
import { InboxList } from '@/ui/components/messaging/inbox-list';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

export interface InboxScreenProps {
  data: InboxPageData;
  now: ISODateTime;
  /** TasksNearMe Help, pinned on top (2026-11-22): the AI assistant, and support once the person asks for a person. */
  help?: HelpSummary;
}

/**
 * Messages: one row per conversation, unread ones first, then newest, with filters (all, unread, offers, bookings)
 * and a search that answer as you type (completion plan 7.3). From 1024 px the list is a pane beside "Choose a
 * conversation", as on a conversation's page.
 */
export function InboxScreen({ data, now, help }: InboxScreenProps) {
  const t = useTranslations('inbox');

  // From 1024 px the panes start at the top, as on a conversation's page (the title stays for screen readers).
  return <div className="mx-auto w-full max-w-content space-y-6">
    <div className={data.threads.length > 0 ? 'lg:sr-only' : undefined}><PageHeader title={t('title')} description={t('description')} /></div>
    {data.threads.length === 0 ? <div className="space-y-3">
      <HelpRow summary={help} now={now} />
      <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<MessagesSquare className="size-6" />} action={{ label: t('viewTasks'), href: routes.app.tasks() }} />
      <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>
    </div> : <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
      {/* From 1024 px the same two panes as an open conversation, so opening one doesn't rearrange the page (audit M34). */}
      <div className="lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-8rem)] lg:flex-col lg:overflow-hidden lg:rounded-[1.375rem] lg:border lg:border-foreground/[0.07] lg:bg-card lg:shadow-card dark:lg:border-white/[0.06]">
        <InboxList threads={data.threads} now={now} variant="split" pinned={<HelpRow summary={help} now={now} variant="split" />} />
      </div>
      <div className="hidden h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-3 rounded-[1.375rem] border border-dashed border-foreground/[0.12] p-8 text-center lg:flex dark:border-white/[0.1]">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><MessagesSquare className="size-6" /></span>
        <p className="font-heading text-lg font-semibold">{t('choose.title')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('choose.body')}</p>
      </div>
    </div>}
  </div>;
}
