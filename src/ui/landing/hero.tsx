import type { HomePageData, ISODateTime } from '@/contracts';
import type { Season } from '@/shared/seasons';
import { cn } from '@/ui/lib/utils';
import { HeroCopy } from './hero-copy';
import { floraFor } from './minimap/flora';
import { TownSkeleton } from './minimap/town-skeleton';
import { TownStage, type TownMode } from './minimap/town-stage';
import { SeasonWeather } from './weather';

/**
 * The hero: the words and the task assistant top-left (`HeroCopy`), and a small 3D town filling the rest of the
 * first screen from the bottom-left to the top-right, with real open tasks pinned on it.
 *
 * Wide screens (lg): the hero is exactly one screen tall (taller only when its words need it), and the town's
 * 16:10 stage is as tall as the hero, so the whole town shows, its bottom edge too. When the screen is wider than
 * the stage, the stage sits against the right edge and the canvas also draws the town's land that runs on to the
 * left of it, so no corner is left empty; when it's narrower, the stage's right side runs past the screen. The
 * stage keeps its top-left corner empty for the words. Tablets and phones: the town is a full-width band (its own
 * 10:8 composition) under the words.
 *
 * As the page scrolls on, the hero stays pinned (wide screens) while the real map slides up over it like a sheet,
 * and the town tilts toward a view from above and pulls back as it's covered: no seam, no gap, no cross-fade.
 * The page's paper (a faint marble) shows through; only a breath of the brand's light sits behind the headline.
 *
 * The town grows the market's own plants (`floraFor`: Austin's Hill Country, or north Florida's live oaks, pines and
 * palmettos for Gainesville). It's dressed for the season (`season`, from the page's `data-season`): the town's
 * trees, lawns, water and light, the season's sky glowing in from the top right (globals.css, "Seasons"), and its
 * weather in the air over the town and under the words (`SeasonWeather`: snow, leaves, petals, summer motes).
 * Previews and tests (`static`) get one still frame of it.
 */
export function Hero({ data, mode, now, season }: { data: HomePageData; mode: TownMode; now: ISODateTime; season: Season }) {
  const localTasks = data.recentTasks.filter((task) => task.location.kind === 'local');
  return (
    <section aria-labelledby="hero-title" className="relative isolate z-[1] [--stage-w:108vw] sm:[--stage-w:104vw] lg:sticky lg:top-[var(--hero-stick,0px)] lg:flex lg:min-h-svh lg:flex-col">
      {/* A breath of the brand's light behind the headline, and the season's sky from the top right; both fade out
          long before any edge. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[calc(100%+8rem)]">
        <div className="hero-haze absolute inset-0" />
      </div>

      {/* The season's weather: over the town, under the words. */}
      <SeasonWeather season={season} still={mode === 'static'} className="absolute inset-0 z-[5] size-full" />

      {/* The words. On wide screens they must end above the town's plates (about 76% of the hero's height): the
          bottom padding keeps them there on most screens, and the town's stage grows the hero when they don't fit. */}
      <div data-hero-words className="relative z-10 mx-auto w-full max-w-[78rem] px-gutter pt-32 sm:pt-36 lg:pointer-events-none lg:pt-[clamp(6.5rem,15svh,10rem)] lg:pb-[24svh]">
        <HeroCopy data={data} now={now} />
      </div>

      {/* The town: a band under the words on phones and tablets, the whole hero behind them on wide screens. */}
      <TownStage
        tasks={localTasks}
        helper={data.featuredHelpers[0]}
        mode={mode}
        season={season}
        flora={floraFor(data.market)}
        weather={mode !== 'static'}
        skeleton={<TownSkeleton />}
        className={cn(
          'relative mt-6 h-[calc(var(--stage-w)*0.74)] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_9%,#000_84%,transparent)] sm:mt-4 sm:h-[calc(var(--stage-w)*0.7)]',
          'lg:absolute lg:inset-0 lg:mt-0 lg:h-auto lg:[container-type:size] lg:[mask-image:none]',
        )}
        stageClassName={cn(
          'top-0 left-[calc((100vw-var(--stage-w))/2)] w-[var(--stage-w)]',
          'lg:left-[max(0px,calc(100cqw-160cqh))] lg:h-[100cqh] lg:w-[160cqh]',
        )}
        controlsClassName="right-4 bottom-[18%] lg:right-[max(var(--page-gutter),calc(50vw-38rem))] lg:bottom-[max(1.5rem,calc(100cqh-100svh+1.5rem))]"
      />
    </section>
  );
}
