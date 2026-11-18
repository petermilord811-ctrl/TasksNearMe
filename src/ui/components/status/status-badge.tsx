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
  /** `sm`: inside a dense row's line of details (the dashboard's lists). */
  size?: 'sm' | 'md';
}

export function StatusBadge({ tone, label, icon, size = 'md' }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full font-medium', size === 'sm' ? 'px-2 py-px text-xs leading-5' : 'px-3 py-1 text-sm leading-5', tones[tone])}>
      {icon && <span aria-hidden="true" className={cn('shrink-0', size === 'sm' ? '[&_svg]:size-3.5' : '[&_svg]:size-4')}>{icon}</span>}
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
