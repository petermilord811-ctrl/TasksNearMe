import { LocaleLink as Link } from '@/ui/lib/locale-link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';

/** A section heading: eyebrow, a title with an accent word (italic serif, violet), and a short line. */
export function Heading({ id, eyebrow, title, accent, body, align = 'left', className }: { id: string; eyebrow: string; title: string; accent?: string; body?: ReactNode; align?: 'left' | 'center'; className?: string }) {
  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
        {title} {accent && <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{accent}</span>}
      </h2>
      {body && <p className="mt-4 text-lg text-pretty text-muted-foreground">{body}</p>}
    </Reveal>
  );
}

/**
 * A text link with an arrow: on hover the underline draws in from the left and the arrow springs forward
 * (`arrow-link` in landing.css); still on touch and with reduced motion.
 */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('arrow-link inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary', className)}>
      <span className="arrow-link-text">{children}</span>
      <ArrowRight aria-hidden="true" className="arrow-link-icon size-4" />
    </Link>
  );
}
