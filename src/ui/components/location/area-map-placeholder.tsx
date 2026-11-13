import { Laptop } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskLocation } from '@/contracts';
import { cn } from '@/ui/lib/utils';

export interface AreaMapPlaceholderProps {
  location: TaskLocation;
  className?: string;
}

/** An illustrative general-area map. It never receives or renders an exact address. */
export function AreaMapPlaceholder({ location, className }: AreaMapPlaceholderProps) {
  const t = useTranslations('location');

  if (location.kind === 'remote') {
    return (
      <div className={cn('flex items-center gap-3 rounded-[1.375rem] bg-secondary p-5 text-secondary-foreground', className)}>
        <Laptop aria-hidden="true" className="size-5 shrink-0" />
        <p>{t('remote')}</p>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-muted', className)}>
      <span className="absolute top-3 right-3 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
        {t('demo')}
      </span>
      <svg
        viewBox="0 0 400 220"
        role="img"
        aria-label={t('mapDescription', { area: location.areaName, market: location.marketName })}
        className="block h-auto w-full"
      >
        <rect width="400" height="220" className="fill-muted" />
        <path d="M-20 47H420M-20 177H420M70-20V240M332-20V240" className="stroke-card" strokeWidth="18" fill="none" />
        <path d="M-20 112H420M145-20V240M258-20V240" className="stroke-card" strokeWidth="10" fill="none" />
        <rect x="79" y="56" width="56" height="46" rx="7" className="fill-secondary" />
        <rect x="270" y="120" width="51" height="45" rx="7" className="fill-secondary" />
        <path d="M-10 212C75 180 50 145 120 156S220 222 280 203 340 170 420 193" className="stroke-border" strokeWidth="15" fill="none" />
        <circle cx="200" cy="110" r="69" className="fill-primary/10 stroke-primary" strokeWidth="2" strokeDasharray="5 5" />
        <rect x="145" y="96" width="110" height="28" rx="14" className="fill-card" />
        <text x="200" y="114" textAnchor="middle" className="fill-foreground font-sans text-[12px] font-medium">
          {t('mapAreaLabel')}
        </text>
      </svg>
    </div>
  );
}
