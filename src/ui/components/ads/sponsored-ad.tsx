import { ArrowUpRight, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { SPONSORED_ADVERTISERS, type SponsoredAdId } from '@/contracts/ads';
import { cn } from '@/ui/lib/utils';
import { AdAbout } from './ad-about';
import { CapCueCreative, HumanizeWordCreative, HumanizeWordIcon } from './creatives';

/**
 * A sponsored card for a rail (2026-11-22): "Sponsored" with the Ad mark, the advertiser's animated creative, then
 * who it is and Learn more. The creative and the line under it are one link to the advertiser's site, in a new tab
 * (`rel="sponsored"`). The creative is a picture to assistive tech, so the link reads the advertiser, its site and
 * what the ad offers. Drawn like the rail's own cards (portal-rail.tsx) so it sits in the column with them.
 * Needs ads.css on the page (the Neighbors route and its previews import it).
 */
export function SponsoredAd({ ad, frame, className }: { ad: SponsoredAdId; /** Previews: show this frame, still. */ frame?: number; className?: string }) {
  const t = useTranslations('ads');
  const advertiser = SPONSORED_ADVERTISERS[ad];
  const id = `sponsored-${ad}`;
  const still = frame === undefined ? {} : { still: frame };
  return (
    <section aria-labelledby={`${id}-label ${id}-name`} className={cn('min-w-0 rounded-2xl border border-border bg-card p-3.5 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <h2 id={`${id}-label`} className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Megaphone aria-hidden="true" className="size-4 text-primary" />{t('label')}
        </h2>
        <AdAbout badge={t('badge')} label={t('about.button')} title={t('about.title')} body={t('about.body')} advertiser={t('about.advertiser', { name: advertiser.name, domain: advertiser.domain })} />
      </div>
      <a href={advertiser.href} target="_blank" rel="sponsored noopener" className="group/ad @container block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <div className="overflow-hidden rounded-xl bg-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/0.04)]">
          {ad === 'humanizeword' ? <HumanizeWordCreative {...still} /> : <CapCueCreative {...still} />}
        </div>
        <div className="flex items-center gap-2.5 pt-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.6rem]">
            {ad === 'humanizeword'
              ? <HumanizeWordIcon className="size-8" />
              : <Image unoptimized src="/ui/ads/capcue-icon.webp" alt="" width={32} height={32} className="size-8" />}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span id={`${id}-name`} className="block truncate text-sm font-semibold text-foreground">{advertiser.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{advertiser.domain}</span>
          </span>
          <span className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground transition-colors group-hover/ad:border-primary/40 group-hover/ad:text-primary">
            <span className="hidden @[17.5rem]:inline">{t('learnMore')}</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </span>
        </div>
        <span className="sr-only">{t('linkNote', { summary: t(`${ad}.summary`) })}</span>
      </a>
    </section>
  );
}
