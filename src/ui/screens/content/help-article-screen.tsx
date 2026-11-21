import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import type { HelpArticleData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { useFormat } from '@/ui/lib/format';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { SupportCard } from '@/ui/components/content/support-card';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/ui/primitives/breadcrumb';

export function HelpArticleScreen({ data }: { data: HelpArticleData }) {
  const { formatDate } = useFormat();
  const t = useTranslations('help');
  return <div className="mx-auto max-w-reading space-y-section">
    <Breadcrumb><BreadcrumbList>
      <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.help()}>{t('title')}</Link></BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbLink asChild><Link href={`${routes.help()}#${data.topic.slug}`}>{data.topic.title}</Link></BreadcrumbLink></BreadcrumbItem>
    </BreadcrumbList></Breadcrumb>
    <article className="space-y-6">
      <PageHeader title={data.title} description={data.summary} />
      <p className="text-sm text-muted-foreground tabular-nums"><time dateTime={data.updatedAt}>{t('updated', { date: formatDate(data.updatedAt, { withYear: true }) })}</time></p>
      <ContentBlocks blocks={data.blocks} />
    </article>
    {/* The guide's next step, for a reader ready to act (visitor-to-first-post walk, J-V). */}
    {data.action?.kind === 'post_task' && <ClosingCta title={t('action.postTask.title')} body={t('action.postTask.body')} action={{ href: routes.app.newTask({ category: data.action.category }), label: t('action.postTask.label') }} />}
    {data.action?.kind === 'become_helper' && <ClosingCta title={t('action.becomeHelper.title')} body={t('action.becomeHelper.body')} action={{ href: routes.becomeAHelper(), label: t('action.becomeHelper.label') }} />}
    {data.related.length > 0 && <Section title={t('relatedTitle')}><ul className="divide-y rounded-[1.375rem] border border-foreground/[0.07] bg-card px-card shadow-card dark:border-white/[0.06]">{data.related.map((article) => <li key={article.slug}><Link href={routes.help(article.slug)} className="group block min-h-11 rounded-md py-4"><h3 className="font-semibold text-primary underline-offset-4 group-hover:underline">{article.title}</h3><p className="mt-1 text-sm text-muted-foreground">{article.summary}</p></Link></li>)}</ul></Section>}
    <SupportCard />
  </div>;
}
