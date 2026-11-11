import type { ReactNode } from 'react';

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className="text-2xl leading-8 font-bold tracking-tight lg:text-3xl lg:leading-[38px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">{description}</p>}</div>{children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}</header>;
}
