import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/contracts';
import { getHelpArticle, listHelpArticleSlugs } from '@/modules/content/loaders';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, helpArticleNode, SITE_NAME } from '@/modules/seo/structured-data';
import { HelpArticleScreen } from '@/ui/screens/content';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export function generateStaticParams() {
  return listHelpArticleSlugs().map((article) => ({ article }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/help/[article]'>): Promise<Metadata> {
  const { article: slug } = await params;
  const article = getHelpArticle(slug, localeOrDefault(await getLocale()));
  if (!article) return {};
  return publicPageMetadata({
    path: routes.help(slug),
    title: article.title,
    description: article.summary,
    kind: { type: 'article', modifiedTime: article.updatedAt },
  });
}

export default async function HelpArticlePage({ params }: PageProps<'/[locale]/help/[article]'>) {
  const article = getHelpArticle((await params).article, localeOrDefault(await getLocale()));
  if (!article) notFound();
  const [context, t] = await Promise.all([structuredDataContext(), getTranslations('server.meta.help')]);
  const path = routes.help(article.slug);
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: t('title'), path: routes.help() },
            { name: article.title, path },
          ]),
          helpArticleNode(context, { title: article.title, summary: article.summary, path, updatedAt: article.updatedAt }),
        ]}
      />
      <HelpArticleScreen data={article} />
    </>
  );
}
