'use client';

import { useState } from 'react';
import { BadgeCheck, House, Phone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VerificationBadges as VerificationBadgeData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/primitives/tooltip';

export interface VerificationBadgesProps {
  badges: VerificationBadgeData;
  compact?: boolean;
  /**
   * `line`: one wrapping line of short words ("ID · Background · Address · Phone") under a "Verified" lead, for cards
   * side by side, where four chips stacked one per line (audit L14). Each word still explains itself on tap.
   */
  variant?: 'chips' | 'line';
}

function VerificationTooltip({ Icon, label, meaning, line = false }: { Icon: LucideIcon; label: string; meaning: string; line?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          // A slim chip that wraps inline with the others (two fit a 360 px card row) and still answers a full 44 px
          // tap: the area reaches 6 px above and below it. In a line: the word and its icon, the same reach.
          className={line
            ? "relative inline-flex min-h-6 items-center gap-1 rounded-md text-left text-[13px] leading-5 font-medium text-foreground underline decoration-foreground/20 decoration-dotted underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:decoration-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            : "relative flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-left text-xs leading-4 font-medium text-secondary-foreground transition-[box-shadow] duration-200 ease-[var(--ease-out)] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"}
        >
          <Icon aria-hidden="true" className={line ? 'size-3.5 shrink-0 text-success' : 'size-3.5 shrink-0'} />
          <span>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-sm leading-5">{meaning}</TooltipContent>
    </Tooltip>
  );
}

export function VerificationBadges({ badges, compact = false, variant = 'chips' }: VerificationBadgesProps) {
  const { formatMonthYear } = useFormat();
  const t = useTranslations('verification');
  const line = variant === 'line';
  const items = [
    ...(badges.idVerifiedAt ? [{
      key: 'identity',
      Icon: ShieldCheck,
      label: line ? t('short.identity') : compact ? t('identity') : t('identityAt', { date: formatMonthYear(badges.idVerifiedAt) }),
      meaning: t('identityMeaningAt', { date: formatMonthYear(badges.idVerifiedAt) }),
    }] : []),
    ...(badges.backgroundCheckedAt ? [{
      key: 'background',
      Icon: BadgeCheck,
      label: line ? t('short.background') : compact ? t('background') : t('backgroundAt', { date: formatMonthYear(badges.backgroundCheckedAt) }),
      meaning: t('backgroundMeaningAt', { date: formatMonthYear(badges.backgroundCheckedAt) }),
    }] : []),
    ...(badges.addressVerifiedAt ? [{
      key: 'address',
      Icon: House,
      label: line ? t('short.address') : compact ? t('address') : t('addressAt', { date: formatMonthYear(badges.addressVerifiedAt) }),
      meaning: t('addressMeaningAt', { date: formatMonthYear(badges.addressVerifiedAt) }),
    }] : []),
    ...(badges.phoneVerified ? [{ key: 'phone', Icon: Phone, label: line ? t('short.phone') : t('phone'), meaning: t('phoneMeaning') }] : []),
  ];

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  }

  if (line) {
    return (
      <TooltipProvider delayDuration={200}>
        <ul aria-label={t('badges')} className="flex list-none flex-wrap items-center gap-x-2.5 gap-y-1">
          <li aria-hidden="true" className="text-[13px] leading-5 text-muted-foreground">{t('short.lead')}</li>
          {items.map(({ key, Icon, label, meaning }) => (
            <li key={key} className="max-w-full">
              <VerificationTooltip Icon={Icon} label={label} meaning={meaning} line />
            </li>
          ))}
        </ul>
      </TooltipProvider>
    );
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
