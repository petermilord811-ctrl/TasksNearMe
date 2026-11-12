import type { ComponentProps } from 'react';
import { formatTime, marketLocalToUtc } from '@/shared/format';
import { Input } from '@/ui/primitives/input';
import { cn } from '@/ui/lib/utils';

export function MarketDateInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  return <Input {...props} type="date" />;
}

export interface MarketTimeSelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  date: string;
  placeholder: string;
}

const times = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`);

/** Shared market-local HH:MM values, with labels formatted in America/Chicago. */
export function MarketTimeSelect({ date, placeholder, className, ...props }: MarketTimeSelectProps) {
  return <select {...props} className={cn('min-h-11 w-full rounded-md border border-input bg-background px-3 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', className)}>
    <option value="">{placeholder}</option>
    {times.map((time) => <option key={time} value={time}>{formatTime(marketLocalToUtc(date, time))}</option>)}
  </select>;
}
