import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { localeOrDefault } from '@/contracts';
import { getHelpArticle, listHelpArticleSlugs } from '@/modules/content/loaders';
import { HelpArticleScreen } from '@/ui/screens/content';

export function generateStaticParams() {
  return listHelpArticleSlugs().map((article) => ({ article }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/help/[article]'>): Promise<Metadata> {
  const article = getHelpArticle((await params).article, localeOrDefault(await getLocale()));
  return article ? { title: article.title, description: article.summary } : {};
}

export default async function HelpArticlePage({ params }: PageProps<'/[locale]/help/[article]'>) {
  const article = getHelpArticle((await params).article, localeOrDefault(await getLocale()));
  if (!article) notFound();
  return <HelpArticleScreen data={article} />;
}
