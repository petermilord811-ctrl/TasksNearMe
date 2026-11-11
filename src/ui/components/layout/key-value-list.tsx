import type { ReactNode } from 'react';

export function KeyValueList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="divide-y divide-border">{items.map((item, index) => <div key={index} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="min-w-0 break-words text-sm font-medium">{item.value}</dd></div>)}</dl>;
}
