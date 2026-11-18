'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Languages, LoaderCircle, LogOut, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import type { ActionHandler, ActionResult, AppShellHandlers, LanguageSwitchHandler, SignedInViewer, StaffViewer } from '@/contracts';
import { APP_LOCALES, LOCALE_NAMES } from '@/contracts/locale';
import { routes } from '@/contracts/routes';
import { AvatarPhoto } from '@/ui/components/people/avatar-photo';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { useLanguageSwitch } from './language-switch';
import { getAppNav, type NavItem } from './nav';
import { NAV_ICONS } from './nav-icons';
import { switchTheme, useEffectiveTheme } from './theme-toggle';

/** The avatar: a soft ring that warms to the brand color while pointed at or open. */
const AVATAR = 'size-11 shrink-0 rounded-full bg-secondary object-cover shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent),0_4px_12px_-6px_rgb(60_30_10/0.4)] transition-[box-shadow] duration-300 ease-[var(--ease-out)] group-hover/avatar:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_28%,transparent),0_6px_16px_-6px_rgb(60_30_10/0.45)] group-data-[state=open]/avatar:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_40%,transparent),0_6px_16px_-6px_rgb(60_30_10/0.45)]';

export interface AccountMenuProps {
  viewer: SignedInViewer | StaffViewer;
  onSignOut: ActionHandler;
  /** The language row's handler (the bars' switch is hidden on phones, so the menu carries it too). */
  onSwitchLanguage?: LanguageSwitchHandler;
  /** Members: the mode switch, which the bar shows from `sm` and this menu below it (audit M38). */
  onModeChange?: AppShellHandlers['onModeChange'];
}

export function AccountMenu({ viewer, onSignOut, onSwitchLanguage, onModeChange }: AccountMenuProps) {
  const t = useTranslations('shell');
  // The initials, also shown when the photo can't be loaded (plan 9.3).
  const initials = <span aria-hidden="true" className={cn(AVATAR, 'inline-flex items-center justify-center text-sm font-semibold text-secondary-foreground')}>{viewer.initials}</span>;
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

  /** The other mode, on phones (the bar's switch is hidden there): the app may lead to helper setup first. */
  async function switchMode() {
    if (viewer.kind !== 'user' || !onModeChange || pendingRef.current) return;
    pendingRef.current = true;
    setMessage({ text: t('mode.pending'), error: false });
    let result: ActionResult;
    try {
      result = await onModeChange({ mode: viewer.mode === 'poster' ? 'helper' : 'poster' });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    pendingRef.current = false;
    const text = feedback(`${result.ok ? 'success' : 'error'}.${result.code}`);
    setMessage({ text, error: !result.ok });
    if (result.ok) {
      toast.success(text);
      if (result.redirectTo) router.push(result.redirectTo);
    } else {
      toast.error(text);
    }
  }

  // Members (completion plan 9.14): the mode's tools where the rail isn't shown (they're on it on wide screens), then
  // the account's pages at every width. Staff menus stay at sign out.
  const nav = viewer.kind === 'user' ? getAppNav(viewer.mode) : null;
  const item = ({ id, href }: NavItem, className?: string) => {
    const Icon = NAV_ICONS[id];
    return <DropdownMenuItem key={id} asChild className={className}><Link href={href}><Icon aria-hidden="true" />{t(`nav.${id}`)}</Link></DropdownMenuItem>;
  };

  return (
    <div className="relative shrink-0">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} type="button" variant="ghost" size="icon" className="group/avatar rounded-full p-0 hover:bg-transparent active:scale-95 dark:hover:bg-transparent" aria-label={t('accountMenu', { name: viewer.displayName, initials: viewer.initials })} aria-describedby={statusId} aria-busy={pending} disabled={pending}>
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : viewer.photo ? <AvatarPhoto src={viewer.photo.src} alt="" size={44} className={AVATAR} fallback={initials} /> : initials}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="px-2.5 pt-2 pb-1.5 font-display text-[0.9375rem] font-semibold break-words">{viewer.displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {viewer.kind === 'user' && onModeChange && <>
            <DropdownMenuItem className="sm:hidden" onSelect={() => void switchMode()}>
              <ArrowLeftRight aria-hidden="true" />{t(viewer.mode === 'poster' ? 'mode.toHelper' : 'mode.toPoster')}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
          </>}
          {nav && <>
            {nav.secondary.map((link) => item(link, 'lg:hidden'))}
            <DropdownMenuSeparator className="lg:hidden" />
            {nav.account.map((link) => item(link))}
            <DropdownMenuSeparator />
          </>}
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
