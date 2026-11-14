import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { devHelpersOn } from '@/shared/dev-helpers';
import { isLocalRequest } from '@/shared/local-request';

/**
 * Dev-only tooling (UI preview gallery, sign in as anyone, the outboxes). Never available in production builds,
 * and only to requests made on this machine: src/proxy.ts says not found to the rest, and this checks again for
 * the paths its matcher skips (a dot in a segment, say; completion plan 5.18).
 */
export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!devHelpersOn()) notFound();
  return (
    <Suspense fallback={null}>
      <LocalOnly>{children}</LocalOnly>
    </Suspense>
  );
}

async function LocalOnly({ children }: Readonly<{ children: React.ReactNode }>) {
  const list = await headers();
  if (!isLocalRequest((name) => list.get(name))) notFound();
  return children;
}
