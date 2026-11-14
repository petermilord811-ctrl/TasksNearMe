'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRing, CreditCard, Gift, Heart, Languages, LifeBuoy, LoaderCircle, LogOut, MessagesSquare, Moon, Sun, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import type { ActionHandler, ActionResult, LanguageSwitchHandler, SignedInViewer, StaffViewer } from '@/contracts';
import { APP_LOCALES, LOCALE_NAMES } from '@/contracts/locale';
import { routes } from '@/contracts/routes';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { useLanguageSwitch } from './language-switch';
import { switchTheme, useEffectiveTheme } from './theme-toggle';

/** The avatar: a soft ring that warms to the brand color while pointed at or open. */
const AVATAR = 'size-11 shrink-0 rounded-full bg-secondary object-cover shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent),0_4px_12px_-6px_rgb(60_30_10/0.4)] transition-[box-shadow] duration-300 ease-[var(--ease-out)] group-hover/avatar:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_28%,transparent),0_6px_16px_-6px_rgb(60_30_10/0.45)] group-data-[state=open]/avatar:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_40%,transparent),0_6px_16px_-6px_rgb(60_30_10/0.45)]';

export interface AccountMenuProps {
  viewer: SignedInViewer | StaffViewer;
  onSignOut: ActionHandler;
  /** The language row's handler (the bars' switch is hidden on phones, so the menu carries it too). */
  onSwitchLanguage?: LanguageSwitchHandler;
}

export function AccountMenu({ viewer, onSignOut, onSwitchLanguage }: AccountMenuProps) {
  const t = useTranslations('shell');
  const theme = useEffectiveTheme();
  const language = useLanguageSwitch(onSwitchLanguage);
  const otherLanguage = APP_LOCALES.find((option) => option !== language.locale) ?? language.locale;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const statusId = useId();
  const pendingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function signOut() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    let result: ActionResult;
    try {
      result = await onSignOut();
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    pendingRef.current = false;
    setPending(false);
    setOpen(false);
    const text = feedback(`${result.ok ? 'success' : 'error'}.${result.code}`);
    setMessage({ text, error: !result.ok });
    if (result.ok) {
      toast.success(text);
      router.push(result.redirectTo ?? routes.home());
    } else {
      toast.error(text);
    }
  }

  const links = viewer.kind === 'user' ? [
    { id: 'community', href: routes.app.community(), icon: MessagesSquare },
    // Phones reach their saved searches (and can stop an alert) from here (completion plan 7.10).
    { id: 'savedSearches', href: routes.app.savedSearches(), icon: BellRing },
    { id: 'account', href: routes.app.account(), icon: UserRound },
    viewer.mode === 'helper'
      ? { id: 'rewards', href: routes.app.rewards(), icon: Gift }
      : { id: 'saved', href: routes.app.saved(), icon: Heart },
    { id: 'payments', href: routes.app.payments(), icon: CreditCard },
    { id: 'support', href: routes.app.support(), icon: LifeBuoy },
  ] : [];

  return (
    <div className="relative shrink-0">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} type="button" variant="ghost" size="icon" className="group/avatar rounded-full p-0 hover:bg-transparent active:scale-95 dark:hover:bg-transparent" aria-label={t('accountMenu', { name: viewer.displayName, initials: viewer.initials })} aria-describedby={statusId} aria-busy={pending} disabled={pending}>
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : viewer.photo ? <Image src={viewer.photo.src} alt="" width={44} height={44} unoptimized className={AVATAR} /> : <span aria-hidden="true" className={cn(AVATAR, 'inline-flex items-center justify-center text-sm font-semibold text-secondary-foreground')}>{viewer.initials}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="px-2.5 pt-2 pb-1.5 font-display text-[0.9375rem] font-semibold break-words">{viewer.displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {links.map(({ id, href, icon: Icon }) => (
            <DropdownMenuItem key={id} asChild>
              <Link href={href}><Icon aria-hidden="true" />{t(`nav.${id}`)}</Link>
            </DropdownMenuItem>
          ))}
          {links.length > 0 && <DropdownMenuSeparator />}
          {/* Members: the theme and the language, also here because the bar's switches don't fit on phones (staff
              tools stay in English, and their menu stays at sign out). */}
          {viewer.kind === 'user' && <>
            <DropdownMenuItem onSelect={() => switchTheme(triggerRef.current)}>
              {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              {t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => language.switchTo(otherLanguage)} lang={otherLanguage}>
              <Languages aria-hidden="true" />
              {LOCALE_NAMES[otherLanguage]}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>}
          <DropdownMenuItem disabled={pending} aria-busy={pending} onSelect={(event) => { event.preventDefault(); void signOut(); }}>
            {pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LogOut aria-hidden="true" />}
            {t(pending ? 'signingOut' : 'signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className={cn(message?.error ? 'absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-destructive bg-card p-3 text-sm text-destructive shadow-xs' : 'sr-only')}>
        {pending ? t('signingOut') : message?.text}
      </p>
    </div>
  );
}
