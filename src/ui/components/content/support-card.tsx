import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';

export function SupportCard() {
  const t = useTranslations('help');
  return <section className="flex flex-col gap-4 rounded-xl border bg-card p-card shadow-card sm:flex-row sm:items-start">
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary"><MessageCircle aria-hidden="true" className="size-5" /></span>
    <div className="min-w-0 space-y-3">
      <h2 className="text-xl leading-7 font-semibold lg:text-[22px] lg:leading-[30px]">{t('supportTitle')}</h2>
      <p className="text-muted-foreground">{t('supportDescription')}</p>
      <Link href={routes.app.support()} className={buttonVariants({ variant: 'outline' })}>{t('supportLink')}</Link>
    </div>
  </section>;
}
