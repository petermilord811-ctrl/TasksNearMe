'use client';

import { useState } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { HomePageData, ISODateTime, MapArea } from '@/contracts';
import { MaskLines } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { ActivityLine } from './hero/activity-line';
import { AreaPicker } from './hero/area-picker';
import { AudienceSwitch } from './hero/audience-switch';
import { AssistantSummary, HeroAssistant, useHeroAssistant } from './hero/hero-assistant';
import { TrustChips } from './hero/trust-chips';
import { useOptionalLanding, type Audience } from './landing-state';

/**
 * On wide screens a row may run wider than the column, as far as the town's empty top-left corner reaches at that
 * height: the town's 16:10 stage is as tall as the hero (about the screen), sits against the right edge when the
 * screen is wider than it, and keeps 750 of its 1600 units clear (75svh). Minus where the column starts and a gap.
 */
const WIDE_ROW = 'lg:w-max lg:max-w-[calc(max(0px,calc(100vw-160svh))+75svh-max(0px,calc(50vw-39rem))-var(--page-gutter)-1.5rem)]';
/** The same reach, as the row's own width (the line of new tasks takes whatever the promises leave). */
const WIDE_LINE = 'lg:w-[calc(max(0px,calc(100vw-160svh))+75svh-max(0px,calc(50vw-39rem))-var(--page-gutter)-1.5rem)]';

/**
 * The hero's words and its ways in, for both audiences:
 * - the market line, which is also the neighborhood picker, and the "Need help · Can help" switch;
 * - the headline and one line on how it works (each audience its own);
 * - the assistant: "I need help to…" (post a task) or "I can…" (find tasks to take, become a helper), one input for
 *   both; its suggestions open over the page;
 * - one row: the newest open tasks taking turns (or, once the assistant is folded with words in it, its one-line
 *   summary in the same place), and three small promises that explain themselves.
 *
 * It sits over the town's empty top-left corner on wide screens, so it has a height budget there: it ends by about
 * three quarters of the screen's height (the spacing shrinks on short screens, and the rows run wide instead of
 * wrapping; `hero.tsx` makes the hero taller if it still can't fit). The switch and the neighborhood are shared
 * page state (the town's pins, the map and its list follow them).
 */
export function HeroCopy({ data, now }: { data: HomePageData; now: ISODateTime }) {
  const t = useTranslations('landing.hero');
  const landing = useOptionalLanding();
  // Outside the landing page's provider (a lone preview), the switch and the pick are local.
  const [ownAudience, setOwnAudience] = useState<Audience>('poster');
  const [ownArea, setOwnArea] = useState<MapArea | null>(null);
  const [switched, setSwitched] = useState(false);
  const audience = landing?.audience ?? ownAudience;
  const area = landing ? landing.area : ownArea;
  const pickArea = landing?.pickArea ?? setOwnArea;
  const helper = audience === 'helper';
  const copy = helper ? 'helperMode.' : '';
  const assistant = useHeroAssistant({ data, now, mode: helper ? 'helper' : 'poster', area });
  // The first time in, the words come in one after another; after a switch, at once.
  const delay = (ms: number) => ({ ['--enter-delay' as string]: `${switched ? 0 : ms}ms` });

  return (
    <div className="max-w-xl lg:pointer-events-auto lg:max-w-[30rem] xl:max-w-[34rem]">
      <div className={cn('enter flex flex-wrap items-center gap-x-3 gap-y-2', WIDE_ROW)} style={{ ['--enter-delay' as string]: '40ms' }}>
        <AreaPicker data={data} area={area} onPick={pickArea} />
        <AudienceSwitch
          audience={audience}
          reward={data.welcomeReward}
          onChange={(next) => {
            if (next === audience) return;
            setSwitched(true);
            if (landing) landing.setAudience(next);
            else setOwnAudience(next);
          }}
        />
      </div>
      <h1 id="hero-title" className="mt-6 font-display text-[clamp(2.6rem,min(4.5vw,7.2svh),4.75rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance [font-stretch:94%] lg:mt-[clamp(0.75rem,2svh,1.5rem)]">
        <MaskLines
          key={audience}
          delay={switched ? 0 : 120}
          lines={[
            t(`${copy}line1`),
            t(`${copy}line2`),
            <>
              <span className="font-accent font-normal tracking-[-0.02em] text-violet italic">{t(`${copy}line3Vivid`)}</span>
              {t(`${copy}line3Rest`)}
            </>,
          ]}
        />
      </h1>
      {/* Painted at once on arrival (it's the page's largest text, so a fade would hold back its first paint);
          after a switch of audience the new line fades in. */}
      <p key={`subtitle-${audience}`} className={cn('mt-5 max-w-[31rem] text-base leading-relaxed text-muted-foreground sm:text-lg lg:mt-[clamp(0.75rem,2svh,1.5rem)] lg:[@media(max-height:720px)]:text-base', switched && 'enter')} style={delay(0)}>
        {t(`${copy}subtitle`)}
      </p>
      <div className="enter relative z-20 mt-8 lg:mt-[clamp(1rem,2.8svh,2.25rem)]" style={{ ['--enter-delay' as string]: '640ms' }}>
        <HeroAssistant assistant={assistant} />
      </div>
      <div className={cn('enter mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:mt-[clamp(0.625rem,1.8svh,1.5rem)]', WIDE_LINE)} style={{ ['--enter-delay' as string]: '760ms' }}>
        {/* The same slot (and height) for the line of new tasks and the folded assistant: nothing moves. */}
        <LazyMotion features={domMax}>
          <div className="relative h-9 min-w-[13rem] flex-1 basis-[13rem]">
            <AnimatePresence initial={false}>
              <m.div
                key={assistant.collapsed ? 'summary' : 'activity'}
                className="absolute inset-0"
                initial={assistant.reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={assistant.reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {assistant.collapsed ? <AssistantSummary assistant={assistant} /> : <ActivityLine data={data} now={now} area={area} onShowAll={() => pickArea(null)} className="h-9" />}
              </m.div>
            </AnimatePresence>
          </div>
        </LazyMotion>
        <TrustChips helpers={data.helpers} />
      </div>
    </div>
  );
}
