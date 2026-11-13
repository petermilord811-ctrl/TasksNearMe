'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { routes } from '@/contracts';

const noSubscribe = () => () => {};
const here = () => `${window.location.pathname}${window.location.search}`;

/** "Verify your ID" after an `identity_required` result, coming back to this page once the check passes. */
export function VerifyIdentityLink({ label }: { label: string }) {
  const next = useSyncExternalStore(noSubscribe, here, () => '');
  return <Link href={routes.app.verifyIdentity(next || undefined)} className="mr-4 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{label}</Link>;
}
