'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { routes, type HomePageData, type MapArea } from '@/contracts';
import { HoverLift, Reveal, usePrefersReducedMotion } from '@/ui/motion';
import { MAP_SECTION_ID, useOptionalLanding } from '../landing-state';
import { ArrowLink } from './heading';

/**
 * Where we work: we open city by city across the US, this market first: its radius and its neighborhoods, each with
 * how many of its tasks are open on the map. A neighborhood is a shortcut: it flies the map above to that
 * neighborhood (the same pick as the hero's market line) and brings the map into view. Somewhere else: the city
 * list, and helpers anywhere can get verified now.
 */
export function CoverageSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.coverage');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const areas = new Map(data.map.areas.map((area) => [area.name, area]));
  const open = new Map<string, number>();
  for (const pin of data.map.pins) open.set(pin.areaName, (open.get(pin.areaName) ?? 0) + 1);

  const hintId = useId();

  const show = (area: MapArea) => {
    landing?.pickArea(area);
    document.getElementById(MAP_SECTION_ID)?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section aria-labelledby="coverage-title" className="sm:py-20">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal>
          <HoverLift surfaceClassName="rounded-[2rem] border border-dashed border-foreground/15 bg-card/45" glow="var(--violet)" tilt={0} lift={0} grow={0}>
            <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-12 lg:p-10">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
                <h2 id="coverage-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em] text-balance">{t('title', { market: data.market.name })}</h2>
                <p className="mt-2 text-muted-foreground">{t('body', { radius: data.market.serviceRadiusMiles, market: data.market.name })}</p>
                {landing && <p id={hintId} className="mt-1 text-sm text-muted-foreground">{t('mapHint')}</p>}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                  <ArrowLink href={routes.waitlist()}>{t('waitlist')}</ArrowLink>
                  <ArrowLink href={routes.becomeAHelper()}>{t('helpersAnywhere')}</ArrowLink>
                </div>
              </div>
              {/* Phones: one row that scrolls sideways (the card's padding bleeds, the next chip peeks in at the edge), not a
                  column of a dozen chips (audit M7). */}
              <ul className="flex flex-wrap gap-2 max-sm:-mx-6 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:*:shrink-0 max-sm:px-6 max-sm:pb-1 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)] max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden">
                {data.market.areaNames.map((name) => {
                  const area = areas.get(name);
                  const count = open.get(name) ?? 0;
                  const inside = (
                    <>
                      <MapPin aria-hidden="true" className="area-chip-pin size-3.5 text-muted-foreground" />
                      {name}
                      {count > 0 && ' '}
                      {count > 0 && (
                        <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-violet-soft px-1.5 text-xs leading-5 font-semibold text-violet tabular-nums">
                          {count}
                          {' '}
                          <span className="sr-only">{t('openTasks', { count })}</span>
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={name}>
                      {area && landing ? (
                        <button type="button" onClick={() => show(area)} aria-describedby={hintId} className="area-chip inline-flex min-h-10 items-center gap-1.5 rounded-full border border-foreground/[0.07] bg-card/80 px-3.5 text-sm font-medium whitespace-nowrap">
                          {inside}
                        </button>
                      ) : (
                        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3.5 text-sm whitespace-nowrap">{inside}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </HoverLift>
        </Reveal>
      </div>
    </section>
  );
}
