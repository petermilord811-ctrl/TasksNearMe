import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getPublicTaskPageData, listRecentTaskSlugs } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { KEEP_OUT_OF_SEARCH } from '@/modules/seo/indexable';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { PublicTaskScreen } from '@/ui/screens/public/public-task-screen';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateStaticParams() {
  const slugs = await listRecentTaskSlugs(searchEngineRows());
  // At least one param is required; a missing task renders the not-found page.
  return (slugs.length > 0 ? slugs : ['no-open-tasks']).map((taskSlug) => ({ taskSlug }));
}

/** What search engines read: the public's task (src/shared/sample-data.ts), whoever is visiting. */
export async function generateMetadata({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>): Promise<Metadata> {
  const { taskSlug } = await params;
  const page = await getPublicTaskPageData(taskSlug, searchEngineRows());
  // Missing, or a sample task where samples are hidden (testers still see it): nothing from it, and never in search.
  if (!page) return KEEP_OUT_OF_SEARCH;
  const { task, acceptingOffers } = page.data;
  // Closed tasks stay reachable for links but drop out of search results.
  return {
    ...(await publicPageMetadata({ path: routes.publicTask(taskSlug), title: task.title, description: task.excerpt })),
    ...(acceptingOffers ? {} : { robots: { index: false } }),
  };
}

/**
 * What anyone may see about a task: general area only, never the address or photos. A task nobody may see is a real
 * 404 (outside Suspense); the screen is drawn for the visitor inside Suspense, so a sample task answers not found to
 * the public where samples are hidden (src/shared/sample-data.ts).
 */
async function PublicTaskPage({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>) {
  const { taskSlug } = await params;
  if (!(await getPublicTaskPageData(taskSlug, 'all'))) notFound();
  const [indexed, context, categoryName] = await Promise.all([getPublicTaskPageData(taskSlug, searchEngineRows()), structuredDataContext(), categoryNames()]);
  return (
    <>
      {/* The trail only: the task's title and the names of its city and category, all on the page already. */}
      {indexed && (
        <JsonLd
          nodes={[
            breadcrumbNode(context, [
              { name: SITE_NAME, path: routes.home() },
              { name: indexed.data.market.name, path: routes.market(indexed.data.market.slug) },
              { name: categoryName(indexed.data.category.slug), path: routes.category(indexed.data.category.slug, indexed.data.market.slug) },
              { name: indexed.data.task.title, path: routes.publicTask(indexed.data.task.slug) },
            ]),
          ]}
        />
      )}
      <Suspense fallback={<PageSkeleton variant="detail" />}>
        <PublicTask slug={taskSlug} />
      </Suspense>
    </>
  );
}

async function PublicTask({ slug }: { slug: string }) {
  const page = await getPublicTaskPageData(slug, await requestRows());
  // A sample task for the public. The page is already streaming, so this answers 200 with noindex (Next adds it).
  if (!page) notFound();
  return <PublicTaskScreen data={page.data} now={page.now} />;
}

export default withClientMessages('[locale]/(public)/tasks/[taskSlug]/page.tsx', PublicTaskPage);
