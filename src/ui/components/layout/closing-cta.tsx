import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * The card a page ends on: a question, one line and the page's main action, in one shape on every public page. They had
 * drifted: one compact, one large, and two pages ended on a bare button (f7's visual pass of the live site, 2026-11-18).
 * The action is a large button, the size every page's main action has.
 */
export function ClosingCta({ title, body, action, className }: { title: string; body?: ReactNode; action: { href: string; label: string }; className?: string }) {
  return <section className={['space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card md:p-10 dark:border-white/[0.06]', className].filter(Boolean).join(' ')}>
    <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-balance md:text-3xl">{title}</h2>
    {body && <p className="max-w-reading text-muted-foreground">{body}</p>}
    <Link href={action.href} className={buttonVariants({ size: 'lg', className: 'whitespace-normal text-center' })}>{action.label}</Link>
  </section>;
}
