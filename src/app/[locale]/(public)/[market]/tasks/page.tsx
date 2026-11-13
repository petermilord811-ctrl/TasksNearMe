import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getMarketPageData, getTaskBoardPageData } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { PageSkeleton } from '@/ui/components';
import { TaskBoardScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';

export async function generateStaticParams() {
  const slugs = await listPublicMarketSlugs();
  return (slugs.length > 0 ? slugs : [DEFAULT_MARKET_SLUG]).map((market) => ({ market }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]/tasks'>): Promise<Metadata> {
  const { market } = await params;
  const [page, t] = await Promise.all([getMarketPageData(market), getTranslations('server.meta.taskBoard')]);
  if (!page) return {};
  const values = { market: page.data.market.name };
  // Filtered and paged URLs all point search engines at the plain board.
  return { title: t('title', values), description: t('description', values), alternates: await languageAlternates(routes.taskBoard(market)) };
}

/** Filters live in the URL, so the list renders per request inside Suspense; the data is cached per query. */
export default function TaskBoardPage({ params, searchParams }: PageProps<'/[locale]/[market]/tasks'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Board params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({ params, searchParams }: Pick<PageProps<'/[locale]/[market]/tasks'>, 'params' | 'searchParams'>) {
  const [{ market }, search] = await Promise.all([params, searchParams]);
  const page = await getTaskBoardPageData(market, parseTaskBoardQuery(search));
  if (!page) notFound();
  return <TaskBoardScreen data={page.data} now={page.now} />;
}
