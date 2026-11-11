import { useId, type ReactNode } from 'react';

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const headingId = useId();
  return <section aria-labelledby={headingId} className="space-y-4"><div><h2 id={headingId} className="text-xl leading-7 font-semibold lg:text-[22px] lg:leading-[30px]">{title}</h2>{description && <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>}</div>{children}</section>;
}
