'use client';

import { useId } from 'react';
import { LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { HomePageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import type { Audience } from '../landing-state';

/**
 * "Need help · Can help": who the hero speaks to. A pill slides to the pick. "Can help" carries the founding
 * reward's amount while the program is open (spoken in full). Each side is a toggle button.
 */
export function AudienceSwitch({ audience, onChange, reward }: { audience: Audience; onChange: (audience: Audience) => void; reward: HomePageData['welcomeReward'] }) {
  const t = useTranslations('landing.hero.audience');
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const open = reward && reward.cohortLimit > reward.spotsClaimed ? reward : undefined;
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
                'relative isolate inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-300 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[""]',
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
                <span className={cn('rounded-full px-1.5 py-px text-[11px] leading-4 font-bold tabular-nums', on ? 'bg-reward text-reward-foreground' : 'bg-reward/20 text-foreground')}>
                  <span aria-hidden="true">+{formatMoney(open.amountCents)}</span>
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
