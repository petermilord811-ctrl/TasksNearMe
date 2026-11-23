import Form from 'next/form';
import { ArrowLeft, AtSign, Search, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { FindPersonPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * "New message" with no one named yet (2026-11-22, owner: "can direct chat through that id, but limited if karma is
 * low"): the person's @username, then their profile and the first message (the conversation's own page). Under the box,
 * what the viewer's Sparks level allows today, and the way to earn more.
 */
export function FindPersonScreen({ data }: { data: FindPersonPageData }) {
  const t = useTranslations('directMessage.find');
  const levels = useTranslations('sparksBadge.levels');
  const locale = useLocale();
  const { formatDateTime, zoneName } = useFormat();
  return <div className="mx-auto w-full max-w-reading space-y-5">
    <header className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Link href={routes.app.messages()} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 size-11 shrink-0 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <h1 className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em]">{t('title')}</h1>
    </header>
    <section className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <p className="text-muted-foreground">{t('description')}</p>
      <Form action={localeHref(routes.app.newMessage(), locale)} className="space-y-2" aria-label={t('title')}>
        <label htmlFor="find-person-username" className="text-sm font-medium">{t('label')}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <AtSign aria-hidden="true" className="ml-3 size-4 shrink-0 text-muted-foreground" />
            <input id="find-person-username" name="u" defaultValue={data.query ?? ''} required maxLength={21} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={t('placeholder')} aria-invalid={data.notFound || undefined} aria-describedby={data.notFound ? 'find-person-error' : 'find-person-hint'} className="min-h-11 w-full min-w-0 bg-transparent px-2 py-2 text-base outline-none" />
          </div>
          <button type="submit" className={buttonVariants({ className: 'min-h-11 rounded-full' })}><Search aria-hidden="true" />{t('submit')}</button>
        </div>
        {data.notFound
          ? <p id="find-person-error" role="alert" className="text-sm text-destructive">{t('notFound', { username: data.query ?? '' })}</p>
          : <p id="find-person-hint" className="text-xs text-muted-foreground">{t('hint')}</p>}
      </Form>
      <div className="flex items-start gap-3 rounded-2xl bg-brand-soft/50 px-4 py-3 text-sm">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">{data.allowanceFrom ? t('allowancePlan', { left: data.allowance.left, perDay: data.allowance.perDay, plan: data.allowanceFrom }) : t('allowance', { left: data.allowance.left, perDay: data.allowance.perDay, level: levels(data.level) })}</p>
          {data.allowance.resetsAt && <p className="text-muted-foreground">{t('resetsAt', { time: formatDateTime(data.allowance.resetsAt), zone: zoneName })}</p>}
          <p className="text-muted-foreground">{t('moreWithSparks')} <Link href={routes.app.sparks()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('sparksLink')}</Link></p>
          {data.allowanceFrom !== 'pro' && <p className="text-muted-foreground">{t('moreWithPlans')} <Link href={routes.app.plan()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('plansLink')}</Link></p>}
        </div>
      </div>
    </section>
  </div>;
}
