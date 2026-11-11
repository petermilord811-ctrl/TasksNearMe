'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ACTION_ERROR_CODES, type ActionResult, type AppShellHandlers, type SignedInViewer, type StaffViewer } from '@/contracts';
import { fakeHandler, mayaShell } from '@/fixtures';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { PageHeader } from '@/ui/components/layout/page-header';
import { AdminShell, AppShell } from '@/ui/shells';
import type { Breadcrumb } from '@/contracts';

const updated: ActionResult = { ok: true, code: 'updated' };

export function AppShellExample({
  initialViewer,
  currentPath,
  modeResult = updated,
  signOutResult = updated,
  hint,
  children,
}: {
  initialViewer: SignedInViewer;
  currentPath?: string;
  modeResult?: ActionResult;
  signOutResult?: ActionResult;
  hint?: 'redirectHint' | 'signOutHint';
  children?: ReactNode;
}) {
  const t = useTranslations('shell');
  const [viewer, setViewer] = useState(initialViewer);
  const onModeChange: AppShellHandlers['onModeChange'] = async (input) => {
    const result = await fakeHandler<{ mode: SignedInViewer['mode'] }>(modeResult)(input);
    if (result.ok) setViewer((previous) => ({ ...previous, mode: input.mode }));
    return result;
  };

  return (
    <>
      <AppShell viewer={viewer} currentPath={currentPath} handlers={{ onModeChange, onSignOut: fakeHandler(signOutResult) }}>
        <PageHeader title={t('preview.contentTitle')} description={t('preview.contentBody')} />
        {hint && <p className="max-w-2xl text-sm text-muted-foreground">{t(`preview.${hint}`)}</p>}
        {children}
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {t('preview.contentPlaceholder')}
        </div>
      </AppShell>
      <AppToaster />
    </>
  );
}

export function ModeResultsExample({ currentPath }: { currentPath: string }) {
  const t = useTranslations('shell');
  const feedback = useTranslations('feedback');
  const results: ActionResult[] = [updated, ...ACTION_ERROR_CODES.map((code) => ({ ok: false as const, code }))];
  const [selected, setSelected] = useState(0);

  return (
    <AppShellExample key={selected} initialViewer={mayaShell} currentPath={currentPath} modeResult={results[selected]}>
      <label className="block max-w-xl space-y-2">
        <span className="block font-medium">{t('preview.modeResult')}</span>
        <select value={selected} onChange={(event) => setSelected(Number(event.target.value))} className="min-h-11 w-full rounded-md border border-input bg-background p-3 text-base">
          {results.map((result, index) => <option key={`${result.ok}-${result.code}`} value={index}>{feedback(`${result.ok ? 'success' : 'error'}.${result.code}`)}</option>)}
        </select>
      </label>
    </AppShellExample>
  );
}

export function AdminShellExample({ viewer, currentPath, breadcrumbs }: { viewer: StaffViewer; currentPath: string; breadcrumbs?: Breadcrumb[] }) {
  const t = useTranslations('shell');
  return (
    <>
      <AdminShell viewer={viewer} currentPath={currentPath} breadcrumbs={breadcrumbs} handlers={{ onSignOut: fakeHandler(updated) }}>
        <PageHeader title={t('preview.adminTitle')} description={t('preview.adminBody')} />
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {t('preview.contentPlaceholder')}
        </div>
      </AdminShell>
      <AppToaster />
    </>
  );
}
