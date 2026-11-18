'use client';

import { useId } from 'react';
import { Gift } from 'lucide-react';
import { LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { HomePageData } from '@/contracts';
import { formatMoney, formatMoneyShort } from '@/shared/format';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import type { Audience } from '../landing-state';

/**
 * "Need help · Can help": who the hero speaks to. A pill slides to the pick. "Can help" carries the welcome gift
 * card's amount while the program is on (spoken in full). Each side is a toggle button.
 */
export function AudienceSwitch({ audience, onChange, reward }: { audience: Audience; onChange: (audience: Audience) => void; reward: HomePageData['welcomeReward'] }) {
  const t = useTranslations('landing.hero.audience');
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  // Every helper who passes the phone, ID and background checks gets it (no spots to run out), so it shows
  // whenever the program is on.
  const open = reward;
  const sides: Audience[] = ['poster', 'helper'];

  return (
    <LazyMotion features={domMax}>
      <div role="group" aria-label={t('label')} className="inline-flex items-center rounded-full border border-foreground/10 bg-card/70 p-0.5 backdrop-blur">
        {sides.map((side) => {
          const on = audience === side;
          return (
            <button
              key={side}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(side)}
              className={cn(
                // 32 px to the eye, 44 px to the finger (the hit area reaches past the pill).
                // One line in every language (audit M10: "Necesito / ayuda" wrapped inside its pill at 360).
                'relative isolate inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-300 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[""]',
                on ? 'text-background' : 'text-foreground/70 hover:text-foreground',
              )}
            >
              {on && (
                <m.span
                  layoutId={pillId}
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-full bg-foreground shadow-[0_8px_20px_-12px_rgb(0_0_0/0.6)]"
                  transition={reduced ? { duration: 0 } : spring.bloom}
                />
              )}
              {t(side)}
              {side === 'helper' && open && (
                // A gift and whole dollars, so it reads as the welcome gift card, not a fee (audit L5).
                <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-xs leading-4 font-bold tabular-nums', on ? 'bg-reward text-reward-foreground' : 'bg-reward/20 text-foreground')}>
                  <Gift aria-hidden="true" className="size-3" />
                  <span aria-hidden="true">+{formatMoneyShort(open.amountCents)}</span>
                  <span className="sr-only">{t('rewardSpoken', { amount: formatMoney(open.amountCents) })}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </LazyMotion>
  );
}
