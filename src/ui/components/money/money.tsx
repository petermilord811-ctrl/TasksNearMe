import type { Cents } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';

export interface MoneyProps {
  cents: Cents;
  signDisplay?: 'auto' | 'always';
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'text-sm leading-5',
  md: 'text-base leading-6',
  lg: 'text-2xl leading-8 font-semibold',
} as const;

export function Money({ cents, signDisplay = 'auto', size = 'md' }: MoneyProps) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', sizes[size])}>
      {formatMoney(cents, { signDisplay })}
    </span>
  );
}
