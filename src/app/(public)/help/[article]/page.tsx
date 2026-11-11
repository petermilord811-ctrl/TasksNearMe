import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getHelpArticle, listHelpArticleSlugs } from '@/modules/content/loaders';
import { PageSkeleton } from '@/ui/components';
import { HelpArticleScreen } from '@/ui/screens/content';

export function generateStaticParams() {
  return listHelpArticleSlugs().map((article) => ({ article }));
}

export async function generateMetadata({ params }: PageProps<'/help/[article]'>): Promise<Metadata> {
  const article = getHelpArticle((await params).article);
  return article ? { title: article.title, description: article.summary } : {};
}

export default function HelpArticlePage({ params }: PageProps<'/help/[article]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <HelpArticle params={params} />
    </Suspense>
  );
}

async function HelpArticle({ params }: Pick<PageProps<'/help/[article]'>, 'params'>) {
  const article = getHelpArticle((await params).article);
  if (!article) notFound();
  return <HelpArticleScreen data={article} />;
}
