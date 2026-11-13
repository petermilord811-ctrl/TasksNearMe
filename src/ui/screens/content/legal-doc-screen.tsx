import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type LegalDocData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { Alert, AlertDescription, AlertTitle } from '@/ui/primitives/alert';

export function LegalDocScreen({ data }: { data: LegalDocData }) {
  const { formatDate } = useFormat();
  const t = useTranslations('legal');
  return <article className="mx-auto max-w-reading space-y-section">
    <div className="space-y-3"><PageHeader title={data.title} /><p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground tabular-nums"><span>{data.version}</span><span aria-hidden="true">·</span><time dateTime={data.updatedAt}>{t('updated', { date: formatDate(data.updatedAt, { withYear: true }) })}</time>{data.status === 'published' && data.effectiveAt && <><span aria-hidden="true">·</span><time dateTime={data.effectiveAt}>{t('effective', { date: formatDate(data.effectiveAt, { withYear: true }) })}</time></>}</p></div>
    {data.status === 'draft' && <Alert role="note" className="border-transparent bg-badge-warning text-badge-warning-foreground"><TriangleAlert aria-hidden="true" /><AlertTitle className="line-clamp-none">{t('draftTitle')}</AlertTitle><AlertDescription className="text-inherit">{t('draftDescription')}</AlertDescription></Alert>}
    <p className="text-base leading-7 text-muted-foreground">{data.summary}</p>
    <nav aria-label={t('contentsTitle')} className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]"><h2 className="mb-2 font-display text-xl font-semibold tracking-[-0.015em]">{t('contentsTitle')}</h2><ol>{data.sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="flex min-h-11 items-center rounded-md py-2 text-primary underline underline-offset-4">{section.title}</a></li>)}</ol></nav>
    {data.sections.map((section) => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6 space-y-4"><h2 id={`${section.id}-title`} className="font-display text-xl leading-7 font-semibold tracking-[-0.015em] lg:text-[22px] lg:leading-[30px]">{section.title}</h2><ContentBlocks blocks={section.blocks} headingLevel={3} /></section>)}
    {data.otherDocs.length > 0 && <div className="border-t pt-6"><Section title={t('otherPoliciesTitle')}><ul className="grid gap-x-6 sm:grid-cols-2">{data.otherDocs.map((document) => <li key={document.doc}><Link href={routes.legal(document.doc)} className="flex min-h-11 items-center rounded-md py-2 text-primary underline underline-offset-4">{document.title}</Link></li>)}</ul></Section></div>}
  </article>;
}
