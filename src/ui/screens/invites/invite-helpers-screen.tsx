import { Bookmark, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type InviteHelpersPageData } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { HelperCard } from '@/ui/components/people/helper-card';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

export interface InviteHelpersScreenProps {
  data: InviteHelpersPageData;
}

/**
 * "Invite helpers" on an open task (2026-11-23, owner: "I hate to redirect to new pages continually"), in a dialog over
 * it: the client's saved helpers, each with Request, which closes it and opens the request dialog over the task with
 * this task chosen. (It went to the Saved helpers page.)
 */
export function InviteHelpersDialogScreen({ data }: InviteHelpersScreenProps) {
  const t = useTranslations('invites.inviteHelpers');
  return <>
    <RouteDialogHeader title={t('title')} description={t('description', { task: data.task.title })} />
    <RouteDialogBody><InviteHelpersBody data={data} /></RouteDialogBody>
  </>;
}

function InviteHelpersBody({ data }: InviteHelpersScreenProps) {
  const t = useTranslations('invites.inviteHelpers');
  if (data.helpers.length === 0) {
    return <EmptyState headingLevel={2} title={t('empty.title')} body={t('empty.body')} icon={<Bookmark className="size-6" />} action={{ label: t('empty.action'), href: routes.app.helpers() }} />;
  }
  return <>
    {/* Each card names its helper in an h3, under this list's own heading. */}
    <h2 className="sr-only">{t('listLabel')}</h2>
    <ul className="space-y-4">
      {data.helpers.map(({ helper, canRequest }) => <li key={helper.id}>
        <HelperCard helper={helper} variant="compact" footer={canRequest
          ? <Link href={routes.app.requestHelper(helper.handle, { taskId: data.task.id })} className={buttonVariants({ variant: 'secondary', className: 'min-h-11 w-full sm:w-auto sm:self-start' })}>{t('request', { name: helper.displayName })}</Link>
          : <p className="text-sm text-muted-foreground">{t('notAvailable', { name: helper.displayName })}</p>} />
      </li>)}
    </ul>
    <p><Link href={routes.app.helpers()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline"><Search aria-hidden="true" className="size-4" />{t('browse')}</Link></p>
  </>;
}
