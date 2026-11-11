'use client';

import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/ui/primitives/button';

export function PrintReceiptButton() {
  const t = useTranslations('receipt');
  return <Button type="button" variant="outline" data-print-hidden onClick={() => window.print()}>
    <Printer aria-hidden="true" />{t('print')}
  </Button>;
}
