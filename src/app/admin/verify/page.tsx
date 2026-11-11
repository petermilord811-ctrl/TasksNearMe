// Temporary staff two-step page until the admin verify screen (UI-018) replaces it.
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { verifyStaffCode } from '@/modules/accounts/actions';
import { getViewer } from '@/platform/auth/viewer';
import { PageHeader, PageSkeleton } from '@/ui/components';

export const metadata = { title: 'Staff verification' };

async function submit(formData: FormData) {
  'use server';
  const result = await verifyStaffCode({ code: String(formData.get('code') ?? '') });
  if (result.ok && result.redirectTo) redirect(result.redirectTo);
}

export default function StaffVerifyPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <StaffVerifyForm />
    </Suspense>
  );
}

async function StaffVerifyForm() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || viewer.user.staffRoles.length === 0) notFound();
  return (
    <main id="main" className="mx-auto max-w-reading px-gutter py-section">
      <PageHeader title="Staff verification" description="Enter your 6-digit code. In development the code is 123456." />
      <form action={submit} className="mt-6 flex gap-3">
        <label htmlFor="code" className="sr-only">
          Code
        </label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="h-11 rounded-md border px-3" />
        <button type="submit" className="h-11 rounded-md bg-primary px-4 text-primary-foreground">
          Verify
        </button>
      </form>
    </main>
  );
}
