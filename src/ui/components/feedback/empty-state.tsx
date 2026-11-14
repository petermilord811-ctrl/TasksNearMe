import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Inbox } from 'lucide-react';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: ReactNode;
  headingLevel?: 2 | 3;
  /** Supply a URL produced by the contract's route builders. */
  action?: { label: string; href: string };
}

/**
 * Nothing here yet: a quiet dashed panel with the icon in a soft tile under a faint glow, the title in the
 * display face, a line of help and, when there's a next step, its button.
 */
export function EmptyState({ title, body, icon, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-[1.375rem] border border-dashed border-foreground/15 bg-card/70 px-6 py-12 text-center dark:border-white/[0.12]">
      <span aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 -z-10 h-44 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_13%,transparent),transparent)]" />
      <span aria-hidden="true" className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-soft text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)] [&_svg]:size-6">
        {icon ?? <Inbox />}
      </span>
      <Heading className="font-display text-xl leading-tight font-semibold tracking-[-0.015em] text-foreground">{title}</Heading>
      {body && <p className="mt-2 max-w-md text-sm leading-6 text-pretty text-muted-foreground">{body}</p>}
      {action && <Link href={action.href} className={cn(buttonVariants(), 'mt-6')}>{action.label}</Link>}
    </div>
  );
}
