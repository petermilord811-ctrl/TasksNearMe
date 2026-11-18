'use client';

import { Suspense, useEffect, useState, type ComponentProps, type MouseEvent } from 'react';
import { useLinkStatus } from 'next/link';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { usePathname } from 'next/navigation';
import { cn } from '@/ui/lib/utils';
import { isNavItemActive, type NavItem } from './nav';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  item: NavItem;
  currentPath?: string;
  activeClassName?: string;
};

/** Every nav link hears a tap on any of them, so the tapped one shows as current at once and the old one steps back. */
const TAP_EVENT = 'tnm:nav-tap';
/** A tap that never leads anywhere (the page refused it, or the network dropped) stops showing after this long. */
const TAP_TIMEOUT_MS = 10_000;

/** While the tapped link's page is still on its way: a slim bar along its edge (transitions.css), from 150 ms on. */
function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending ? '' : undefined} className="nav-pending-hint" />;
}

function MatchedLink({ item, currentPath, activeClassName, className, onClick, children, ...props }: NavLinkProps) {
  const matches = currentPath !== undefined && isNavItemActive(item, currentPath);
  // A tap shows at once (plan 9.5): until the address changes, the tapped link reads as current, so the gliding pill
  // (NavIndicator follows aria-current) and the colors move on the tap, not when the next page has arrived.
  const [tap, setTap] = useState<{ on: string; href: string } | null>(null);
  useEffect(() => {
    if (currentPath === undefined) return;
    const heard = (event: Event) => setTap({ on: currentPath, href: (event as CustomEvent<string>).detail });
    window.addEventListener(TAP_EVENT, heard);
    return () => window.removeEventListener(TAP_EVENT, heard);
  }, [currentPath]);
  useEffect(() => {
    if (!tap) return;
    const timer = window.setTimeout(() => setTap(null), TAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [tap]);
  // A tap made on another page is over: the address has changed since.
  const tapped = tap !== null && tap.on === currentPath ? tap.href : null;
  const active = tapped === null ? matches : tapped === item.href;
  const tapLink = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // New tabs and windows aren't a switch of this page.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    window.dispatchEvent(new CustomEvent(TAP_EVENT, { detail: item.href }));
  };
  return (
    <Link {...props} href={item.href} onClick={tapLink} aria-current={active ? 'page' : undefined} className={cn('relative', className, active && activeClassName)}>
      {children}
      <PendingHint />
    </Link>
  );
}

function PathnameLink(props: NavLinkProps) {
  const pathname = usePathname();
  return <MatchedLink {...props} currentPath={pathname ?? undefined} />;
}

/** Keep request-time pathname reads inside an isolated Cache Components boundary. */
export function NavLink(props: NavLinkProps) {
  if (props.currentPath !== undefined) return <MatchedLink {...props} />;
  return <Suspense fallback={<MatchedLink {...props} />}><PathnameLink {...props} /></Suspense>;
}
