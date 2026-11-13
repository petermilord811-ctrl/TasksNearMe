'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type HelperSummary, type SavedHelperHandlers, type SavedHelpersPageData } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { HelperCard } from '@/ui/components/people/helper-card';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export interface SavedHelpersPreviewState {
  helperId: string;
  result?: ActionResult;
  pending?: boolean;
}

function SavedHelperItem({ helper, handlers, onRemoved, preview }: {
  helper: HelperSummary;
  handlers: SavedHelperHandlers;
  onRemoved: (name: string) => void;
  preview?: SavedHelpersPreviewState;
}) {
  const t = useTranslations('savedHelpers');
  const router = useRouter();
  const [result, setResult] = useState(preview?.result);
  const [pending, setPending] = useState(preview?.pending ?? false);
  const locked = useRef(false);
  const removed = result?.ok && result.code === 'updated';

  async function remove() {
    if (locked.current || pending || removed) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try { next = await handlers.onToggleSaved({ helperId: helper.id, saved: false }); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) {
      if (next.code === 'updated') onRemoved(helper.displayName);
      if (next.redirectTo) router.push(next.redirectTo);
      else if (next.code === 'updated') router.refresh();
    }
  }

  return <li className="flex min-w-0 flex-col gap-3">
    <div className="flex-1"><HelperCard helper={helper} /></div>
    <Link href={routes.app.requestHelper(helper.handle)} className={buttonVariants({ variant: 'secondary' })}>{t('request', { name: helper.displayName })}</Link>
    <Button type="button" variant="outline" className="self-start" disabled={pending || removed} aria-busy={pending} aria-label={t(pending ? 'removingLabel' : removed ? 'removedLabel' : 'removeLabel', { name: helper.displayName })} onClick={() => void remove()}>
      {pending ? <Spinner aria-hidden="true" /> : removed ? <Check aria-hidden="true" /> : null}
      {t(pending ? 'removing' : removed ? 'removedButton' : 'remove')}
    </Button>
    <FormFeedback
      result={result && !result.ok ? { ...result, fieldErrors: undefined } : removed ? undefined : result}
      errorMessage={result && !result.ok && (result.code === 'not_found' || result.code === 'unknown') ? t(`errors.${result.code}`) : undefined}
    />
  </li>;
}

export function SavedHelpersList({ data, handlers, preview }: { data: SavedHelpersPageData; handlers: SavedHelperHandlers; preview?: SavedHelpersPreviewState }) {
  const t = useTranslations('savedHelpers');
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // Confirmation persists when refreshed props remove a helper, including the last one.
  const [removedName, setRemovedName] = useState(preview?.result?.ok && preview.result.code === 'updated' ? data.helpers.find((helper) => helper.id === preview.helperId)?.displayName : undefined);

  return <section aria-labelledby={id} className="space-y-4">
    <h2 id={id} ref={heading} tabIndex={-1} className="font-display text-xl font-semibold tracking-[-0.015em] lg:text-[22px]">{t('listTitle', { count: data.helpers.length })}</h2>
    <FormFeedback result={removedName ? { ok: true, code: 'updated' } : undefined} successMessage={removedName ? t('removed', { name: removedName }) : undefined} />
    {data.helpers.length ? <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {data.helpers.map((helper) => <SavedHelperItem key={helper.id} helper={helper} handlers={handlers} preview={preview?.helperId === helper.id ? preview : undefined} onRemoved={(name) => {
        setRemovedName(name);
        heading.current?.focus();
      }} />)}
    </ul> : <EmptyState headingLevel={3} title={t('emptyTitle')} body={t('emptyBody')} icon={<Bookmark className="size-6" />} action={{ label: t('viewBookings'), href: routes.app.bookings() }} />}
  </section>;
}
