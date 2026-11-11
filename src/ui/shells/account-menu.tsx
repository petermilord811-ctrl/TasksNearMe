'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CreditCard, Gift, Heart, LifeBuoy, LoaderCircle, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { routes, type ActionHandler, type ActionResult, type SignedInViewer, type StaffViewer } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';

export interface AccountMenuProps {
  viewer: SignedInViewer | StaffViewer;
  onSignOut: ActionHandler;
}

export function AccountMenu({ viewer, onSignOut }: AccountMenuProps) {
  const t = useTranslations('shell');
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
          <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={t('accountMenu', { name: viewer.displayName, initials: viewer.initials })} aria-describedby={statusId} aria-busy={pending} disabled={pending}>
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{viewer.initials}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="break-words">{viewer.displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {links.map(({ id, href, icon: Icon }) => (
            <DropdownMenuItem key={id} asChild>
              <Link href={href}><Icon aria-hidden="true" />{t(`nav.${id}`)}</Link>
            </DropdownMenuItem>
          ))}
          {links.length > 0 && <DropdownMenuSeparator />}
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
