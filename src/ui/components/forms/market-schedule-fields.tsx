import type { ComponentProps } from 'react';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { Input } from '@/ui/primitives/input';
import { cn } from '@/ui/lib/utils';
import { nativeSelectClassName } from './native-select';

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
  const { formatTime } = useFormat();
  return <select {...props} className={cn(nativeSelectClassName, 'tabular-nums', className)}>
    <option value="">{placeholder}</option>
    {times.map((time) => <option key={time} value={time}>{formatTime(marketLocalToUtc(date, time))}</option>)}
  </select>;
}
