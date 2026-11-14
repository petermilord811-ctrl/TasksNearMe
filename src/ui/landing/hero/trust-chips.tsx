'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, HandCoins, ShieldCheck, type LucideIcon } from 'lucide-react';
import { routes, type HomePageData } from '@/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { cn } from '@/ui/lib/utils';

interface Chip {
  id: string;
  icon: LucideIcon;
  label: string;
  body: string[];
  link: { href: string; label: string };
}

/**
 * Three small promises, each a button that opens a short explanation and a link to the page with the details:
 * the helpers are ID-verified (with how many there are, when there are some), the price is agreed up front, and
 * payment goes through the platform.
 */
export function TrustChips({ helpers, className }: { helpers: HomePageData['helpers']; className?: string }) {
  const t = useTranslations('landing.hero.trustChips');
  const chips: Chip[] = [
    {
      id: 'verified',
      icon: BadgeCheck,
      label: helpers.verified > 0 ? t('verifiedCount', { count: helpers.verified }) : t('verified'),
      body: [t('verifiedBody'), ...(helpers.openThisWeek > 0 ? [t('openThisWeek', { count: helpers.openThisWeek })] : [])],
      link: { href: routes.trustAndSafety(), label: t('learnTrust') },
    },
    { id: 'price', icon: HandCoins, label: t('price'), body: [t('priceBody')], link: { href: routes.pricing(), label: t('learnPricing') } },
    { id: 'payment', icon: ShieldCheck, label: t('payment'), body: [t('paymentBody')], link: { href: routes.trustAndSafety(), label: t('learnTrust') } },
  ];

  return (
    <ul aria-label={t('label')} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <li key={chip.id}>
            <Popover>
              <PopoverTrigger className="relative inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/10 bg-card/60 px-2.5 text-xs font-medium text-foreground/80 transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:border-foreground/25 hover:text-foreground data-[state=open]:border-violet/40 data-[state=open]:text-foreground">
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
                {chip.label}
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} aria-label={chip.label} className="w-72 rounded-2xl border-foreground/10 bg-card p-4 text-sm shadow-overlay">
                <p className="flex items-center gap-2 font-semibold"><Icon aria-hidden="true" className="size-4 text-success" />{chip.label}</p>
                {chip.body.map((line) => (
                  <p key={line} className="mt-2 leading-relaxed text-muted-foreground">{line}</p>
                ))}
                <Link href={chip.link.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">
                  {chip.link.label}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </PopoverContent>
            </Popover>
          </li>
        );
      })}
    </ul>
  );
}
