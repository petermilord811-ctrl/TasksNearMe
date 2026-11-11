'use client';

import { Suspense, type ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/ui/lib/utils';
import { isNavItemActive, type NavItem } from './nav';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  item: NavItem;
  currentPath?: string;
  activeClassName?: string;
};

function MatchedLink({ item, currentPath, activeClassName, className, ...props }: NavLinkProps) {
  const active = currentPath !== undefined && isNavItemActive(item, currentPath);
  return <Link {...props} href={item.href} aria-current={active ? 'page' : undefined} className={cn(className, active && activeClassName)} />;
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
