import { useId, type ReactNode } from 'react';

/** A titled part of a page. `headingLevel` 3 for a part inside a group that has its own heading (the account page). */
export function Section({ title, description, children, headingLevel = 2 }: { title: string; description?: string; children: ReactNode; headingLevel?: 2 | 3 }) {
  const headingId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return <section aria-labelledby={headingId} className="space-y-4"><div><Heading id={headingId} className="font-display text-xl leading-7 font-semibold tracking-[-0.02em] lg:text-[1.375rem] lg:leading-[1.875rem]">{title}</Heading>{description && <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>}</div>{children}</section>;
}
