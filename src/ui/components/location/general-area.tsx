import { Laptop, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskLocation } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { GeneralAreaMap } from '@/ui/components/map/general-area-map';

export interface GeneralAreaProps {
  location: TaskLocation;
  showMap?: boolean;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
  className?: string;
}

export function GeneralArea({ location, showMap = false, liveMap = true, className }: GeneralAreaProps) {
  const t = useTranslations('location');

  if (location.kind === 'remote') {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="flex items-start gap-2 font-medium">
          <Laptop aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>{t('remote')}</span>
        </p>
        <p className="text-sm text-muted-foreground">{t('remoteDescription')}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <p className="flex items-start gap-2 font-medium">
          <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>{t('areaName', { area: location.areaName, market: location.marketName })}</span>
        </p>
        {location.distanceBand && (
          <p className="text-sm text-muted-foreground">{t(`distance.${location.distanceBand}`)}</p>
        )}
        <p className="text-sm text-muted-foreground">{t('areaDescription')}</p>
      </div>
      {showMap && <GeneralAreaMap location={location} live={liveMap} />}
    </div>
  );
}
