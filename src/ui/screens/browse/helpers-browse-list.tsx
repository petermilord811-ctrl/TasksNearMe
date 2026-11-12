'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, BookmarkCheck, CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperBrowseRow, type SavedHelperHandlers } from '@/contracts';
import { formatDateTime } from '@/shared/format';
import { HelperCard } from '@/ui/components/people/helper-card';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

function Row({ row, handlers, onMessage }: { row: HelperBrowseRow; handlers: SavedHelperHandlers; onMessage: (message: string) => void }) {
  const t = useTranslations('helpersBrowse');
  const categories = useTranslations('helperCard.categories');
  const router = useRouter();
  const [saved, setSaved] = useState(row.saved);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const { helper } = row;

  async function toggle() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    const next = !saved;
    let ok = false;
    try {
      ok = (await handlers.onToggleSaved({ helperId: helper.id, saved: next })).ok;
    } catch {
      ok = false;
    }
    locked.current = false;
    setPending(false);
    if (!ok) {
      onMessage(t('error'));
      return;
    }
    setSaved(next);
    onMessage(t(next ? 'savedMessage' : 'removedMessage', { name: helper.displayName }));
    router.refresh();
  }

  return <li className="flex min-w-0 flex-col gap-3">
    <div className="flex-1"><HelperCard helper={helper} /></div>
    {row.nextOpenTime && <p className="flex items-center gap-2 text-sm font-medium"><CalendarClock aria-hidden="true" className="size-4 shrink-0 text-primary" /><span><time dateTime={row.nextOpenTime.start}>{t('nextOpen', { date: formatDateTime(row.nextOpenTime.start) })}</time>{' · '}{categories(row.nextOpenTime.categorySlug)}</span></p>}
    <div className="flex flex-wrap gap-2">
      <Link href={routes.app.requestHelper(helper.handle)} className={buttonVariants({ variant: 'secondary' })}>{t('request', { name: helper.displayName })}</Link>
      <Button type="button" variant="outline" aria-pressed={saved} aria-busy={pending} disabled={pending} aria-label={t(saved ? 'unsaveLabel' : 'saveLabel', { name: helper.displayName })} onClick={() => void toggle()}>
        {pending ? <Spinner aria-hidden="true" /> : saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {t(saved ? 'saved' : 'save')}
      </Button>
    </div>
  </li>;
}

/** The results: helper cards with "Ask" and a save toggle. */
export function HelpersBrowseList({ rows, handlers }: { rows: HelperBrowseRow[]; handlers: SavedHelperHandlers }) {
  const [message, setMessage] = useState('');
  return <>
    <p role="status" className={message ? 'text-sm font-medium' : 'sr-only'}>{message}</p>
    <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <Row key={row.helper.id} row={row} handlers={handlers} onMessage={setMessage} />)}</ul>
  </>;
}
