import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type PreviewEntry } from '@/contracts';
import { jordan, muellerArea, DESK_TIMES } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { KeyValueList } from '@/ui/components/layout/key-value-list';
import { buttonVariants } from '@/ui/primitives/button';
import copy from '../../../messages/en/ui/layout.json';

function LayoutPreview({ variant }: { variant: 'page-header' | 'section' | 'key-value-list' }) {
  const t = useTranslations('layout');
  return <main className="mx-auto max-w-reading space-y-8">
    <PageHeader title={t('title')} description={t('description')}>
      {variant === 'page-header' && <Link href={routes.help()} className={buttonVariants({ variant: 'outline' })}>{t('viewHelp')}</Link>}
    </PageHeader>
    {variant === 'section' && <Section title={t('sectionTitle')} description={t('sectionDescription')}><div className="rounded-xl border bg-card p-card shadow-card"><p>{t('sectionBody')}</p></div></Section>}
    {variant === 'key-value-list' && <KeyValueList items={[{ label: t('person'), value: jordan.displayName }, { label: t('area'), value: muellerArea.areaName }, { label: t('date'), value: formatDateTime(DESK_TIMES.agreedStart) }]} />}
  </main>;
}

export const layoutPreviews: PreviewEntry[] = [
  { id: 'layout/page-header', group: copy.pageHeaderPreview, title: copy.pageHeaderPreview, render: () => <LayoutPreview variant="page-header" /> },
  { id: 'layout/section', group: copy.pageHeaderPreview, title: copy.sectionPreview, render: () => <LayoutPreview variant="section" /> },
  { id: 'layout/key-value-list', group: copy.pageHeaderPreview, title: copy.keyValuePreview, render: () => <LayoutPreview variant="key-value-list" /> },
];
