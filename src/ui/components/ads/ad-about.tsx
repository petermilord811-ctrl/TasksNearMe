'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';

export interface AdAboutProps {
  /** The visible mark, "Ad". */
  badge: string;
  /** The button's name, "About this ad" (it holds the visible "Ad"). */
  label: string;
  title: string;
  body: string;
  /** Who advertises and their site. */
  advertiser: string;
}

/** The "Ad ⓘ" mark at an ad's corner: it opens why you see the ad and who placed it, as ad networks' badges do. */
export function AdAbout({ badge, label, title, body, advertiser }: AdAboutProps) {
  return (
    <Popover>
      <PopoverTrigger aria-label={label} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-foreground/30 data-[state=open]:text-foreground">
        {badge}
        <Info aria-hidden="true" className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-1.5 text-sm">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="leading-relaxed text-muted-foreground">{body}</p>
        <p className="text-xs text-muted-foreground">{advertiser}</p>
      </PopoverContent>
    </Popover>
  );
}
