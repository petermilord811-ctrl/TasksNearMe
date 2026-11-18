import { ViewTransition, type ReactNode } from 'react';

/**
 * A page switch (plan 9.5): the page that leaves fades out and the new one fades in where it is (transitions.css).
 * Route groups use it in their template.tsx, which mounts it afresh on every navigation: only those enter and exit,
 * so updates inside a page (searches, filters, saving, content streaming in) never animate (`default="none"`).
 * Named transitions inside a page (the landing card's icon flying into the category page) keep their own.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
