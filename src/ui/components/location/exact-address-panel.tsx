'use client';

import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, LoaderCircle, Lock, Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ExactAddress, ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';

export interface ExactAddressPanelProps {
  address: ExactAddress;
  visibleUntil?: ISODateTime;
  /** Supply a URL built by the routes contract once its external Maps builder is available. */
  mapsHref?: string;
  /** Directions in the helper's own maps app (`routes.external.googleMapsDirections` / `appleMapsDirections`). */
  directions?: { google: string; apple: string };
  className?: string;
}

/** The sole renderer of ExactAddress. Access decisions belong to the app, before these props arrive. */
export function ExactAddressPanel({ address, visibleUntil, mapsHref, directions, className }: ExactAddressPanelProps) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('location');
  const titleId = useId();
  const mapsHintId = useId();
  const copyInFlight = useRef(false);
  const [copyState, setCopyState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const locality = t('addressLocality', { city: address.city, state: address.state, zip: address.zip });

  async function copyAddress() {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyState('pending');
    try {
      const text = [address.line1, address.line2, locality].filter(Boolean).join('\n');
      await navigator.clipboard.writeText(text);
      setCopyState('success');
    } catch {
      setCopyState('error');
    } finally {
      copyInFlight.current = false;
    }
  }

  return (
    <section aria-labelledby={titleId} className={cn('space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 text-card-foreground shadow-sm sm:p-6 dark:border-white/[0.06]', className)}>
      <div className="space-y-3">
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
          <Lock aria-hidden="true" className="size-5 shrink-0 text-primary" />
          {t('exactAddress')}
        </h2>
        <address className="break-words text-base leading-6 not-italic">
          <span className="block">{address.line1}</span>
          {address.line2 && <span className="block">{address.line2}</span>}
          <span className="block">{locality}</span>
        </address>
      </div>

      {address.accessNotes && (
        <div className="space-y-1 rounded-lg bg-muted p-3">
          <h3 className="text-sm font-semibold">{t('accessNotes')}</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{address.accessNotes}</p>
        </div>
      )}

      {/* One row (audit L32): copy, and the maps: with directions, one "Directions" menu (Google, Apple, or the map). */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5" disabled={copyState === 'pending'} aria-busy={copyState === 'pending'} onClick={copyAddress}>
            {copyState === 'pending' ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : copyState === 'success' ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {t(copyState === 'pending' ? 'copyPending' : 'copyAddress')}
          </Button>
          {/* Directions in the helper's own maps app, when the app supplies them (nothing is stored or geocoded). */}
          {directions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5"><Navigation aria-hidden="true" className="size-4" />{t('directions')}<ChevronDown aria-hidden="true" className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {([['google', directions.google], ['apple', directions.apple]] as const).map(([app, href]) => <DropdownMenuItem key={app} asChild className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5">
                  <a href={href} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" className="size-4" />{t(app === 'google' ? 'directionsGoogle' : 'directionsApple')}<span className="sr-only">{t('opensNewTab')}</span></a>
                </DropdownMenuItem>)}
                {mapsHref && <DropdownMenuItem asChild className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5">
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4" />{t('openMaps')}<span className="sr-only">{t('opensNewTab')}</span></a>
                </DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : mapsHref ? (
            <Button asChild variant="outline" className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5">
              <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('openMaps')}
                <span className="sr-only">{t('opensNewTab')}</span>
              </a>
            </Button>
          ) : (
            // TODO(contract): routes.external.googleMapsSearch(address: ExactAddress): string.
            <Button type="button" variant="outline" className="min-h-11 flex-1 px-3.5 sm:flex-none sm:px-5" disabled aria-describedby={mapsHintId}>
              <ExternalLink aria-hidden="true" className="size-4" />
              {t('openMaps')}
            </Button>
          )}
        </div>
        {!mapsHref && <p id={mapsHintId} className="text-sm text-muted-foreground">{t('mapsUnavailable')}</p>}
        <p role="status" aria-live="polite" aria-atomic="true" className={cn('text-sm', copyState === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {copyState === 'success' ? t('copySuccess') : copyState === 'error' ? t('copyError') : null}
        </p>
      </div>

      {visibleUntil && (
        <p className="text-sm text-muted-foreground">
          <time dateTime={visibleUntil}>{t('visibleUntil', { date: formatDateTime(visibleUntil) })}</time>
        </p>
      )}
    </section>
  );
}
