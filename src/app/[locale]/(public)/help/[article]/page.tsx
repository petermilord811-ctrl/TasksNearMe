import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { localeOrDefault } from '@/contracts';
import { getHelpArticle, listHelpArticleSlugs } from '@/modules/content/loaders';
import { HelpArticleScreen } from '@/ui/screens/content';
import { languageAlternates } from '@/i18n/metadata';
import { routes } from '@/contracts';

export function generateStaticParams() {
  return listHelpArticleSlugs().map((article) => ({ article }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/help/[article]'>): Promise<Metadata> {
  const { article: slug } = await params;
  const article = getHelpArticle(slug, localeOrDefault(await getLocale()));
  return article ? { title: article.title, description: article.summary, alternates: await languageAlternates(routes.help(slug)) } : {};
}

export default async function HelpArticlePage({ params }: PageProps<'/[locale]/help/[article]'>) {
  const article = getHelpArticle((await params).article, localeOrDefault(await getLocale()));
  if (!article) notFound();
  return <HelpArticleScreen data={article} />;
}
