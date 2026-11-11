'use client';

import { useState } from 'react';
import { BadgeCheck, Phone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VerificationBadges as VerificationBadgeData } from '@/contracts';
import { formatMonthYear } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/primitives/tooltip';

export interface VerificationBadgesProps {
  badges: VerificationBadgeData;
  compact?: boolean;
}

function VerificationTooltip({ Icon, label, meaning }: { Icon: LucideIcon; label: string; meaning: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 max-w-full items-center gap-2 rounded-full bg-secondary px-3 py-2 text-left text-sm font-medium text-secondary-foreground">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-sm leading-5">{meaning}</TooltipContent>
    </Tooltip>
  );
}

export function VerificationBadges({ badges, compact = false }: VerificationBadgesProps) {
  const t = useTranslations('verification');
  const items = [
    ...(badges.idVerifiedAt ? [{
      key: 'identity',
      Icon: ShieldCheck,
      label: compact ? t('identity') : t('identityAt', { date: formatMonthYear(badges.idVerifiedAt) }),
      meaning: t('identityMeaningAt', { date: formatMonthYear(badges.idVerifiedAt) }),
    }] : []),
    ...(badges.backgroundCheckedAt ? [{
      key: 'background',
      Icon: BadgeCheck,
      label: compact ? t('background') : t('backgroundAt', { date: formatMonthYear(badges.backgroundCheckedAt) }),
      meaning: t('backgroundMeaningAt', { date: formatMonthYear(badges.backgroundCheckedAt) }),
    }] : []),
    ...(badges.phoneVerified ? [{ key: 'phone', Icon: Phone, label: t('phone'), meaning: t('phoneMeaning') }] : []),
  ];

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ul aria-label={t('badges')} className={cn('flex list-none flex-wrap gap-2', !compact && 'flex-col items-start')}>
        {items.map(({ key, Icon, label, meaning }) => (
          <li key={key} className="max-w-full">
            <VerificationTooltip Icon={Icon} label={label} meaning={meaning} />
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
