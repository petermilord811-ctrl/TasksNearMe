import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, CreditCard, Tags } from 'lucide-react';
import { routes, type HomePageData } from '@/contracts';
import type { Season } from '@/shared/seasons';
import { HoverLift, Magnetic, Reveal } from '@/ui/motion';
import { SeasonOrnament } from '../season-ornament';

/** The brand's gradient: the card's color outside a season (each season has its own, globals.css "Seasons"). */
const BRAND_GRADIENT = 'linear-gradient(120deg, #3b1d8f, #7a2bd1 30%, #d2357a 62%, #ff7a45)';

/**
 * The closing call to action: post a task or browse open ones, with the three promises underneath. Its gradient
 * and a quiet scatter of shapes follow the season (`season`).
 */
export function ClosingSection({ data, season }: { data: HomePageData; season?: Season }) {
  const t = useTranslations('landing.closing');
  const chips = useTranslations('landing.hero.trustChips');
  const promises = [
    { key: 'verified', Icon: BadgeCheck },
    { key: 'price', Icon: Tags },
    { key: 'payment', Icon: CreditCard },
  ] as const;
  return (
    <section aria-labelledby="closing-title" className="px-gutter pt-6 pb-16 sm:pt-12 sm:pb-32">
      <Reveal variant="bloom" origin="50% 100%" className="mx-auto max-w-content">
        <HoverLift surfaceClassName="overflow-hidden rounded-[2.5rem] text-white" glow="#ffffff" tilt={0} lift={0} grow={0}>
          <div aria-hidden="true" className="absolute inset-0 -z-10 [animation:hue-drift_14s_ease-in-out_infinite]" style={{ backgroundImage: `var(--closing-gradient, ${BRAND_GRADIENT})`, backgroundSize: '220% 220%' }} />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_255_255/0.18),transparent_60%)]" />
          {season && <SeasonOrnament season={season} className="-z-10 text-white" />}
          <div className="px-6 py-16 text-center sm:px-12 sm:py-24">
            <h2 id="closing-title" className="mx-auto max-w-3xl font-display text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance">
              {t('title')} <span className="font-accent font-normal italic">{t('titleAccent')}</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/85">{t('body')}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Magnetic>
                <Link href={routes.app.newTask()} className="cta-pill cta-pill-light inline-flex min-h-13 items-center gap-2 rounded-full bg-white px-7 font-semibold text-[#1a1033]">
                  {t('primary')}<ArrowRight aria-hidden="true" className="cta-arrow size-4" />
                </Link>
              </Magnetic>
              <Link href={routes.taskBoard(data.market.slug)} className="cta-ghost inline-flex min-h-13 items-center gap-2 rounded-full border border-white/40 px-6 font-semibold text-white">
                {t('secondary')}
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/80">
              {promises.map(({ key, Icon }) => (
                <li key={key} className="inline-flex items-center gap-1.5"><Icon aria-hidden="true" className="size-4 text-white/90" />{chips(key)}</li>
              ))}
            </ul>
          </div>
        </HoverLift>
      </Reveal>
    </section>
  );
}
