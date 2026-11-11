import type { ReactNode } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: ReactNode;
  /** Supply a URL produced by the contract's route builders. */
  action?: { label: string; href: string };
}

export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <span aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        {icon ?? <Inbox className="size-6" />}
      </span>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {body && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>}
      {action && <Link href={action.href} className={cn(buttonVariants(), 'mt-6')}>{action.label}</Link>}
    </div>
  );
}
