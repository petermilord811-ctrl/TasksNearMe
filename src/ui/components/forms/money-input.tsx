'use client';

import { useState, type ComponentProps } from 'react';
import { formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { Input } from '@/ui/primitives/input';

export interface MoneyInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange'> {
  value: number;
  /** Invalid or incomplete text is represented by -1 until the amount is valid. */
  onValueChange: (cents: number) => void;
}

/** Keeps unfinished decimal text while passing integer cents to contract forms. */
export function MoneyInput({ value, onValueChange, ...props }: MoneyInputProps) {
  const [editing, setEditing] = useState<{ cents: number; raw: string }>();
  return <Input
    inputMode="decimal"
    {...props}
    value={editing && Object.is(editing.cents, value) ? editing.raw : Number.isInteger(value) && value >= 0 ? formatMoneyInput(value) : ''}
    onChange={(event) => {
      const raw = event.target.value;
      const cents = parseMoneyInput(raw) ?? -1;
      setEditing({ raw, cents });
      onValueChange(cents);
    }}
  />;
}
