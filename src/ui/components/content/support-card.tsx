import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';

export function SupportCard() {
  const t = useTranslations('help');
  return <section className="flex flex-col gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card sm:flex-row sm:items-start dark:border-white/[0.06]">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary"><MessageCircle aria-hidden="true" className="size-5" /></span>
    <div className="min-w-0 space-y-3">
      <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.015em] lg:text-[22px] lg:leading-[30px]">{t('supportTitle')}</h2>
      <p className="text-muted-foreground">{t('supportDescription')}</p>
      <Link href={routes.helpContact()} className={buttonVariants({ variant: 'outline' })}>{t('supportLink')}</Link>
    </div>
  </section>;
}
