'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, CircleUserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from '@/shared/locale';

/** Where helper setup's steps live: the link would only lead to the page it sits on. */
const ONBOARDING_PREFIX = routes.app.helperOnboarding().replace(/\/[^/]+$/, '');
/** Home: its "Needs your attention" starts with the same step, with what it's for (plan 9.9). */
const HOME = routes.app.home();

/**
 * "Finish setting up to start helping", above every page for a helper who can't be booked yet; not on the setup
 * steps themselves (audit L17), nor on Home, which leads with that step already. `currentPath`: the shell's, when it's
 * given one (previews), else the browser's.
 */
export function HelperSetupLink({ currentPath }: { currentPath?: string }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const path = splitLocalePath(currentPath ?? pathname)?.path ?? currentPath ?? pathname;
  if (path === HOME || path === ONBOARDING_PREFIX || path.startsWith(`${ONBOARDING_PREFIX}/`)) return null;
  return (
    <Link href={routes.app.helperOnboarding()} className="group flex min-h-11 items-center gap-3 rounded-2xl border border-primary/25 bg-secondary/80 p-4 text-sm font-medium text-secondary-foreground shadow-card transition-[translate,box-shadow,background-color] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:bg-secondary">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-card/80 text-primary"><CircleUserRound className="size-5" /></span>
      <span>{t('helperSetup')}</span>
      <ArrowRight aria-hidden="true" className="ml-auto size-5 shrink-0 transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-x-1" />
    </Link>
  );
}
