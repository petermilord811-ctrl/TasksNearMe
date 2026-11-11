'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts';
import { fakeHandler, jordanReportSubject } from '@/fixtures';
import { ReportDialog } from '@/ui/components/safety';
import { Button } from '@/ui/primitives/button';

export function ReportExample({ result, pending }: { result?: ActionResult; pending?: boolean }) {
  const t = useTranslations('safety');
  const [open, setOpen] = useState(true);
  return <>
    <Button onClick={() => setOpen(true)}>{t('report')}</Button>
    <ReportDialog subject={jordanReportSubject} onReport={fakeHandler(result ?? { ok: true, code: 'submitted' }, pending ? 60_000 : 400)} open={open} onOpenChange={setOpen} initialResult={result} initialPending={pending} initialValues={pending ? { reason: 'off_platform_payment', details: t('previews.draft') } : undefined} />
  </>;
}
