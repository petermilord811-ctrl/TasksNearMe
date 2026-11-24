'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Bookmark, BookmarkCheck, Check, Clock3, ExternalLink, Hammer, Languages, Laptop, Leaf, MapPin, MessageCircle, MessagesSquare, Package, RotateCcw, Sparkles, ThumbsUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { routes, type CategorySlug, type HelperPeekData, type HelperServiceDetail, type HelpPeekData, type LegalPeekData, type PeekData, type PeekTarget } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { peekHref } from '@/shared/peek-links';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { NeighborsAnswers } from '@/ui/components/people/neighbors-answers';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { ReviewCard } from '@/ui/components/reviews/review-card';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/ui/primitives/alert';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/ui/primitives/sheet';
import { Spinner } from '@/ui/primitives/spinner';
import { PublicThankYouNotes } from '@/ui/components/thanks/public-thank-you-notes';

/** What the sheet has for its target: not asked yet, loading, ready, or failed (`notFound`: nothing there to show). */
export type PeekLoad = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: PeekData } | { status: 'error'; notFound?: boolean };

/** Where the sheet sits: beside the page (the left while a chat window is open, so it stays in view), or from below. */
export type PeekPlacement = 'right' | 'left' | 'bottom';

export interface PeekSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  target: PeekTarget | null;
  load: PeekLoad;
  placement: PeekPlacement;
  /** Modal on phones and over a route dialog; beside the page (and its chat window) otherwise. */
  modal: boolean;
  /** An earlier peek in this sheet (an article opened from another): Back returns to it. */
  canGoBack: boolean;
  onBack(): void;
  /** Another peek in the same sheet: a related article, a help center article, another policy. */
  onShow(target: PeekTarget): void;
  onRetry(): void;
  /** The helper's buttons; the app decides how each opens (the chat window, a dialog over the page). */
  onMessage(handle: string): void;
  onRequest(handle: string): void;
  /** Save or remove the helper; resolves whether it worked. */
  onToggleSaved(helperId: string, saved: boolean): Promise<boolean>;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

const sectionTitle = 'font-display text-base font-semibold tracking-[-0.01em]';

function ServiceLine({ service }: { service: HelperServiceDetail }) {
  const t = useTranslations('helperProfile');
  const Icon = categoryIcons[service.categorySlug];
  const price = service.pricingType === 'fixed' && service.fromPriceCents !== undefined
    ? t('fixedPrice', { amount: formatMoney(service.fromPriceCents) })
    : service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
      ? service.minHours !== undefined
        ? t('hourlyMinimum', { amount: formatMoney(service.hourlyRateCents), hours: formatHours(service.minHours) })
        : t('hourlyPrice', { amount: formatMoney(service.hourlyRateCents) })
      : t('priceInOffer');
  return <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-foreground/[0.07] bg-card px-3 py-2.5 dark:border-white/[0.06]">
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, var(--cat-${service.categorySlug}) 15%, transparent)`, color: `var(--cat-${service.categorySlug})` }}><Icon className="size-4" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t(`categories.${service.categorySlug}`)}</span><span className="block text-sm tabular-nums text-muted-foreground">{price}</span></span>
  </li>;
}

/** A helper's profile, short: who, how others rate them, what they do and for how much, their latest review. */
function HelperPeek({ data, onToggleSaved }: { data: HelperPeekData; onToggleSaved: PeekSheetProps['onToggleSaved'] }) {
  const t = useTranslations('helperProfile');
  const peek = useTranslations('peek');
  const thanks = useTranslations('thanks.profile');
  const { formatMonthYear } = useFormat();
  const { profile, self } = data;
  const { helper } = profile;
  const [bioOpen, setBioOpen] = useState(false);
  const longBio = profile.bio.length > 280;
  const latest = profile.reviews[0];
  return <div className="space-y-5">
    <div className="flex min-w-0 items-start gap-4">
      <InitialsAvatar initials={helper.initials} photo={helper.photo} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        {profile.username && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">@{profile.username}</p>}
        {helper.headline && <p className="text-[15px] leading-6">{helper.headline}</p>}
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('travelRadius', { miles: profile.serviceRadiusMiles, area: helper.areaName })}</span></p>
      </div>
    </div>
    {self && <p role="note" className="rounded-xl bg-secondary/70 px-3 py-2 text-sm text-secondary-foreground">{peek('yourProfile')}</p>}
    <div className="space-y-3">
      <RatingStars rating={helper.rating} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm tabular-nums">
        <li className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="size-4 text-success" />{t('completed', { count: helper.completedCount })}</li>
        {helper.recommendedBy !== undefined && <li className="inline-flex items-center gap-1.5"><ThumbsUp aria-hidden="true" className="size-4 text-primary" />{t('recommendedBy', { count: helper.recommendedBy })}</li>}
        {profile.neighborsAnswers && <li className="inline-flex items-center gap-1.5"><MessagesSquare aria-hidden="true" className="size-4 text-primary" />{t('neighborsHelped', { count: profile.neighborsAnswers.helpedCount })}</li>}
        {helper.responseTime !== undefined && <li className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />{t('responseTime', { range: helper.responseTime })}</li>}
      </ul>
      <VerificationBadges badges={helper.badges} compact />
      {profile.sparks && <SparksBadge sparks={profile.sparks} />}
      <p className="text-sm text-muted-foreground">{t('memberSince', { date: formatMonthYear(helper.memberSince) })}</p>
    </div>
    {profile.bio && <section aria-label={t('about', { name: helper.displayName })} className="space-y-2">
      <h3 className={sectionTitle}>{t('about', { name: helper.displayName })}</h3>
      <p className={cn('whitespace-pre-line break-words text-[15px] leading-7', !bioOpen && longBio && 'line-clamp-5')}>{profile.bio}</p>
      {longBio && <button type="button" aria-expanded={bioOpen} onClick={() => setBioOpen((value) => !value)} className="inline-flex min-h-9 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{peek(bioOpen ? 'readLess' : 'readMore')}</button>}
    </section>}
    {profile.services.length > 0 && <section aria-label={t('services')} className="space-y-2">
      <h3 className={sectionTitle}>{t('services')}</h3>
      <ul className="grid gap-2">{profile.services.map((service) => <ServiceLine key={service.categorySlug} service={service} />)}</ul>
    </section>}
    {profile.neighborsAnswers && <NeighborsAnswers answers={profile.neighborsAnswers} headingId={`peek-answers-${helper.id}`} heading="h3" compact />}
    {latest && <section aria-label={peek('latestReview')} className="space-y-2">
      <h3 className={sectionTitle}>{peek('latestReview')}</h3>
      <ReviewCard review={latest} reportHref={routes.app.report('review', latest.id)} />
    </section>}
    {/* Thank-you notes the helper chose to show (2026-11-24), apart from the review. */}
    {profile.thanks && profile.thanks.length > 0 && <section aria-label={thanks('title')} className="space-y-2">
      <h3 className={sectionTitle}>{thanks('title')}</h3>
      <PublicThankYouNotes notes={profile.thanks} compact />
    </section>}
    {!self && <SaveButton helperId={helper.id} saved={data.saved} onToggleSaved={onToggleSaved} />}
  </div>;
}

/** Save or remove the helper, said at once and settled by the answer (back as it was if it fails). */
function SaveButton({ helperId, saved, onToggleSaved }: { helperId: string; saved: boolean; onToggleSaved: PeekSheetProps['onToggleSaved'] }) {
  const t = useTranslations('peek');
  const [state, setState] = useState(saved);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="space-y-1">
    <Button type="button" variant="outline" size="sm" aria-pressed={state} disabled={pending} aria-busy={pending} className="min-h-10 rounded-full" onClick={() => {
      const next = !state;
      setState(next);
      setPending(true);
      setFailed(false);
      void onToggleSaved(helperId, next).then((ok) => {
        if (!ok) {
          setState(!next);
          setFailed(true);
        }
      }).finally(() => setPending(false));
    }}>
      {pending ? <Spinner aria-hidden="true" /> : state ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{t(state ? 'saved' : 'save')}
    </Button>
    {failed && <p role="alert" className="text-sm text-destructive">{t('saveFailed')}</p>}
  </div>;
}

/** The help center: its topics, each with its articles; one opens in this sheet. */
function HelpCenterPeek({ data, onShow }: { data: Extract<HelpPeekData, { kind: 'center' }>['data']; onShow: PeekSheetProps['onShow'] }) {
  return <div className="space-y-5">
    {data.topics.map((topic) => <section key={topic.slug} aria-label={topic.title} className="space-y-2">
      <h3 className={sectionTitle}>{topic.title}</h3>
      <ul className="divide-y rounded-2xl border border-foreground/[0.07] bg-card px-3 dark:border-white/[0.06]">
        {topic.articles.map((article) => <li key={article.slug}><button type="button" onClick={() => onShow({ kind: 'help', slug: article.slug })} className="block w-full min-h-11 py-3 text-left focus-visible:outline-2 focus-visible:outline-ring"><span className="block font-semibold text-primary">{article.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{article.summary}</span></button></li>)}
      </ul>
    </section>)}
  </div>;
}

/** One help article, as its page shows it, with its next step and the related ones (each opens here). */
function HelpArticlePeek({ data, onShow }: { data: Extract<HelpPeekData, { kind: 'article' }>['data']; onShow: PeekSheetProps['onShow'] }) {
  const t = useTranslations('help');
  const { formatDate } = useFormat();
  return <article className="space-y-5">
    <p className="text-[15px] leading-7 text-muted-foreground">{data.summary}</p>
    <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={data.updatedAt}>{t('updated', { date: formatDate(data.updatedAt, { withYear: true }) })}</time></p>
    <ContentBlocks blocks={data.blocks} headingLevel={3} />
    {data.action?.kind === 'post_task' && <Link href={routes.app.newTask({ category: data.action.category })} className={buttonVariants({ className: 'min-h-11 rounded-full' })}>{t('action.postTask.label')}</Link>}
    {data.action?.kind === 'become_helper' && <Link href={routes.becomeAHelper()} className={buttonVariants({ className: 'min-h-11 rounded-full' })}>{t('action.becomeHelper.label')}</Link>}
    {data.related.length > 0 && <section aria-label={t('relatedTitle')} className="space-y-2">
      <h3 className={sectionTitle}>{t('relatedTitle')}</h3>
      <ul className="divide-y rounded-2xl border border-foreground/[0.07] bg-card px-3 dark:border-white/[0.06]">
        {data.related.map((article) => <li key={article.slug}><button type="button" onClick={() => onShow({ kind: 'help', slug: article.slug })} className="block w-full min-h-11 py-3 text-left focus-visible:outline-2 focus-visible:outline-ring"><span className="block font-semibold text-primary">{article.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{article.summary}</span></button></li>)}
      </ul>
    </section>}
  </article>;
}

/** A legal document, as its page shows it (English only, as there). */
function LegalPeek({ data, onShow }: { data: LegalPeekData; onShow: PeekSheetProps['onShow'] }) {
  const t = useTranslations('legal');
  const { formatDate } = useFormat();
  const englishOnly = useLocale() !== 'en';
  return <article className="space-y-5">
    <p className="flex flex-wrap gap-x-2 text-sm tabular-nums text-muted-foreground"><span>{data.version}</span><span aria-hidden="true">·</span><time dateTime={data.updatedAt}>{t('updated', { date: formatDate(data.updatedAt, { withYear: true }) })}</time></p>
    {data.status === 'draft' && <Alert role="note" className="border-transparent bg-badge-warning text-badge-warning-foreground"><TriangleAlert aria-hidden="true" /><AlertTitle className="line-clamp-none">{t('draftTitle')}</AlertTitle><AlertDescription className="text-inherit">{t('draftDescription')}</AlertDescription></Alert>}
    {englishOnly && <Alert role="note"><Languages aria-hidden="true" /><AlertTitle className="line-clamp-none">{t('englishOnlyTitle')}</AlertTitle><AlertDescription>{t('englishOnlyDescription')}</AlertDescription></Alert>}
    <p lang="en" className="text-[15px] leading-7 text-muted-foreground">{data.summary}</p>
    {data.sections.map((section) => <section key={section.id} lang="en" aria-label={section.title} className="space-y-3"><h3 className={sectionTitle}>{section.title}</h3><ContentBlocks blocks={section.blocks} headingLevel={3} /></section>)}
    {data.otherDocs.length > 0 && <section aria-label={t('otherPoliciesTitle')} className="space-y-2 border-t pt-4">
      <h3 className={sectionTitle}>{t('otherPoliciesTitle')}</h3>
      <ul lang="en" className="grid gap-1">{data.otherDocs.map((document) => <li key={document.doc}><button type="button" onClick={() => onShow({ kind: 'legal', doc: document.doc })} className="flex min-h-11 items-center text-left text-primary underline underline-offset-4">{document.title}</button></li>)}</ul>
    </section>}
  </article>;
}

/** The sheet's title for what's loading or loaded. */
function useTitle(target: PeekTarget | null, load: PeekLoad): { title: string; description?: string } {
  const t = useTranslations('peek');
  if (load.status === 'ready') {
    const { data } = load;
    if (data.kind === 'helper') return { title: data.data.profile.helper.displayName, description: t('kinds.helper') };
    if (data.kind === 'legal') return { title: data.data.title, description: t('kinds.legal') };
    return data.data.kind === 'center' ? { title: t('helpCenter'), description: t('kinds.help') } : { title: data.data.data.title, description: t('kinds.help') };
  }
  return { title: t(`kinds.${target?.kind ?? 'help'}`) };
}

/**
 * A peek (2026-11-23, owner: "I hate redirect … some buttons need new window instead of direct. or some buttons need
 * sidebar or left/right/bottom navigator bar"): a helper's profile, a help article, the help center or a policy, read
 * beside the page instead of leaving it. On wide screens a side sheet that leaves the page (and an open chat window) in
 * use; on phones one from the bottom. Above the chat window and route dialogs. "Open in new tab" leads to the page.
 */
export function PeekSheet(props: PeekSheetProps) {
  const { open, onOpenChange, target, load, placement, modal, canGoBack, onBack, onShow, onRetry, onMessage, onRequest, onToggleSaved } = props;
  const t = useTranslations('peek');
  const helperProfile = useTranslations('helperProfile');
  const { title, description } = useTitle(target, load);
  const helper = load.status === 'ready' && load.data.kind === 'helper' ? load.data.data : undefined;
  const side = placement;
  const body: ReactNode = load.status === 'ready'
    ? load.data.kind === 'helper'
      ? <HelperPeek key={load.data.data.profile.helper.id} data={load.data.data} onToggleSaved={onToggleSaved} />
      : load.data.kind === 'legal'
        ? <LegalPeek data={load.data.data} onShow={onShow} />
        : load.data.data.kind === 'center'
          ? <HelpCenterPeek data={load.data.data.data} onShow={onShow} />
          : <HelpArticlePeek data={load.data.data.data} onShow={onShow} />
    : load.status === 'error'
      ? <div role="alert" className="space-y-3 py-6 text-center text-sm"><p>{t(load.notFound ? 'notFound' : 'failed')}</p>{!load.notFound && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onRetry}><RotateCcw aria-hidden="true" />{t('retry')}</Button>}</div>
      : <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('loading')}</p>;

  // A link inside the sheet to another page (an article's next step, a link in its text) goes there: the sheet closes.
  // Links to another peek are the app's to catch (they open here), and new-tab links leave the sheet as it is.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('data-peek-link')) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    window.setTimeout(() => {
      if (!event.defaultPrevented) onOpenChange(false);
    }, 0);
  };

  return <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
    <SheetContent
      side={side}
      data-peek-sheet=""
      overlayClassName="z-[60]"
      // Focus on the sheet itself as it opens, not its first button: that was a verification badge, whose tooltip opened
      // on focus and took the first Escape (2026-11-23). Screen readers still start at its title.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.focus();
      }}
      onInteractOutside={(event) => {
        // Beside the page, the chat windows stay in use: a click there leaves the sheet open.
        const into = event.target instanceof Element ? event.target : null;
        if (!modal && into?.closest('[data-chat-window], [data-chat-docked], [data-chat-docked-row], [data-chat-launcher]')) event.preventDefault();
      }}
      className={cn(
        'z-[60] gap-0 p-0 outline-none',
        side === 'bottom' ? 'max-h-[88dvh] pb-[env(safe-area-inset-bottom)]' : 'w-full max-w-[min(28rem,100vw)] sm:max-w-md',
        !modal && 'shadow-[0_0_0_1px_rgb(23_18_14/0.06),0_30px_80px_-20px_rgb(40_20_5/0.45)]',
      )}
    >
      {side === 'bottom' && <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-foreground/15" />}
      <header className="flex min-w-0 items-center gap-1 border-b border-foreground/[0.07] py-2.5 pr-14 pl-2 dark:border-white/[0.06]">
        {canGoBack && <button type="button" onClick={onBack} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-10 shrink-0 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-4" /></button>}
        <div className={cn('min-w-0 flex-1', !canGoBack && 'pl-2')}>
          <SheetTitle className="truncate text-base">{title}</SheetTitle>
          {description ? <SheetDescription className="truncate text-xs">{description}</SheetDescription> : <SheetDescription className="sr-only">{t('kinds.help')}</SheetDescription>}
        </div>
        {target && <a href={peekHref(target)} target="_blank" rel="noopener" aria-label={t('openInNewTab')} title={t('openInNewTab')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-10 shrink-0 rounded-full' })}><ExternalLink aria-hidden="true" className="size-4" /></a>}
      </header>
      <div onClickCapture={onClickCapture} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{body}</div>
      {helper && !helper.self && <footer className="flex flex-wrap gap-2 border-t border-foreground/[0.07] p-3 dark:border-white/[0.06]">
        <Button type="button" className="min-h-11 flex-1 rounded-full" onClick={() => onRequest(helper.profile.helper.handle)}>{helperProfile('requestBooking', { name: helper.profile.helper.displayName })}</Button>
        {helper.profile.acceptsMessages && <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => onMessage(helper.profile.helper.handle)}><MessageCircle aria-hidden="true" />{t('message')}</Button>}
        <a href={peekHref({ kind: 'helper', handle: helper.profile.helper.handle })} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', className: 'min-h-11 rounded-full' })}><ExternalLink aria-hidden="true" />{t('openProfile')}</a>
      </footer>}
    </SheetContent>
  </Sheet>;
}
