'use client';

import { useState } from 'react';
import { BadgeCheck, House, Phone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VerificationBadges as VerificationBadgeData } from '@/contracts';
import { formatMonthYear } from '@/shared/format';
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          // A slim chip that wraps inline with the others (two fit a 360 px card row) and still answers a full 44 px
          // tap: the area reaches 6 px above and below it.
          className="relative flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-left text-xs leading-4 font-medium text-secondary-foreground transition-[box-shadow] duration-200 ease-[var(--ease-out)] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
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
    ...(badges.addressVerifiedAt ? [{
      key: 'address',
      Icon: House,
      label: compact ? t('address') : t('addressAt', { date: formatMonthYear(badges.addressVerifiedAt) }),
      meaning: t('addressMeaningAt', { date: formatMonthYear(badges.addressVerifiedAt) }),
    }] : []),
    ...(badges.phoneVerified ? [{ key: 'phone', Icon: Phone, label: t('phone'), meaning: t('phoneMeaning') }] : []),
  ];

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ul aria-label={t('badges')} className="flex list-none flex-wrap gap-x-1.5 gap-y-2">
        {items.map(({ key, Icon, label, meaning }) => (
          <li key={key} className="max-w-full">
            <VerificationTooltip Icon={Icon} label={label} meaning={meaning} />
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
