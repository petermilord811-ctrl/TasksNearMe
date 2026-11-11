import type { ReactNode } from 'react';
import type { BadgeTone } from '@/contracts';
import { cn } from '@/ui/lib/utils';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-badge-neutral text-badge-neutral-foreground',
  brand: 'bg-badge-brand text-badge-brand-foreground',
  info: 'bg-badge-info text-badge-info-foreground',
  success: 'bg-badge-success text-badge-success-foreground',
  warning: 'bg-badge-warning text-badge-warning-foreground',
  danger: 'bg-badge-danger text-badge-danger-foreground',
  reward: 'bg-badge-reward text-badge-reward-foreground',
};

export interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
  icon?: ReactNode;
}

export function StatusBadge({ tone, label, icon }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium leading-5', tones[tone])}>
      {icon && <span aria-hidden="true" className="shrink-0 [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
