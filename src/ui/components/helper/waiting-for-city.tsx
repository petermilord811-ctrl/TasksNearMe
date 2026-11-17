import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type FindWorkWaiting } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * "We're not in {city} yet" (completion plan 8.4), for a helper who gave a ZIP no open market covers: that we'll
 * email them when it opens, how many others near their ZIP are waiting, and the waitlist for that ZIP. Find work
 * and the signed-in home show the same note from the same data (`waitingFor`), so they can't disagree.
 */
export function WaitingForCityNote({ waiting, headingLevel = 2 }: { waiting: FindWorkWaiting; headingLevel?: 2 | 3 }) {
  const t = useTranslations('findWork.waiting');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  // The others: everyone on the waitlist near them, and the waiting helpers but this one.
  const others = waiting.waiting + Math.max(0, waiting.helpersWaiting - 1);
  return <section aria-labelledby={`waiting-${waiting.zip}`} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card sm:p-6 dark:border-white/[0.06]">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary"><MapPin className="size-5" /></span>
      <div className="min-w-0 space-y-1.5">
        <Heading id={`waiting-${waiting.zip}`} className="font-display text-xl/7 font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{t('title', { city: waiting.city })}</Heading>
        <p className="text-[15px] text-muted-foreground">{t('body', { city: waiting.city, state: waiting.state })}</p>
      </div>
    </div>
    <p className="text-sm font-medium tabular-nums">{t('demand', { people: others, zip: waiting.zip })}</p>
    <Link href={routes.waitlist({ zip: waiting.zip })} className={buttonVariants({ variant: 'outline' })}>{t('waitlist', { zip: waiting.zip })}<ArrowRight aria-hidden="true" /></Link>
  </section>;
}
