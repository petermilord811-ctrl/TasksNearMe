import { Flag, HandHeart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type PublicThankYouNote } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

/**
 * "Thank-you notes" on a helper's profile and in its peek (2026-11-24): notes clients sent that the helper chose to show,
 * newest first, each with the client's first name and area, or "A client in {area}". No stars: they're apart from reviews.
 */
export function PublicThankYouNotes({ notes, compact = false, className }: { notes: PublicThankYouNote[]; compact?: boolean; className?: string }) {
  const t = useTranslations('thanks.profile');
  const { formatDate } = useFormat();
  return <ul className={cn('grid gap-3', !compact && 'md:grid-cols-2', className)}>
    {notes.map((note) => {
      const from = note.firstName ? (note.area ? t('from', { name: note.firstName, area: note.area }) : note.firstName) : note.area ? t('anonymous', { area: note.area }) : t('anonymousNoArea');
      return <li key={note.id} className="min-w-0">
        <figure className="flex h-full flex-col gap-2 rounded-2xl border border-foreground/[0.07] bg-card p-4 dark:border-white/[0.06]">
          <HandHeart aria-hidden="true" className="size-4 text-primary" />
          <blockquote className="whitespace-pre-line text-[15px] leading-6 [overflow-wrap:anywhere]">{note.text}</blockquote>
          <figcaption className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>— {from} · <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time></span>
            <Link href={routes.app.report('thanks', note.id)} aria-label={t('reportFrom', { from })} className="inline-flex min-h-10 items-center gap-1 text-xs underline-offset-4 hover:text-foreground hover:underline"><Flag aria-hidden="true" className="size-3.5" />{t('report')}</Link>
          </figcaption>
        </figure>
      </li>;
    })}
  </ul>;
}
