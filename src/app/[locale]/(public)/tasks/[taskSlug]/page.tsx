import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTaskPageData, listRecentTaskSlugs } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { PublicTaskScreen } from '@/ui/screens/public';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateStaticParams() {
  const slugs = await listRecentTaskSlugs();
  // At least one param is required; a missing task renders the not-found page.
  return (slugs.length > 0 ? slugs : ['no-open-tasks']).map((taskSlug) => ({ taskSlug }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>): Promise<Metadata> {
  const { taskSlug } = await params;
  const page = await getPublicTaskPageData(taskSlug);
  if (!page) return {};
  const { task, acceptingOffers } = page.data;
  // Closed tasks stay reachable for links but drop out of search results.
  return {
    ...(await publicPageMetadata({ path: routes.publicTask(taskSlug), title: task.title, description: task.excerpt })),
    ...(acceptingOffers ? {} : { robots: { index: false } }),
  };
}

/** What anyone may see about a task: general area only, never the address or photos. */
async function PublicTaskPage({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>) {
  const page = await getPublicTaskPageData((await params).taskSlug);
  if (!page) notFound();
  const [context, categoryName] = await Promise.all([structuredDataContext(), categoryNames()]);
  const { task, category, market } = page.data;
  return (
    <>
      {/* The trail only: the task's title and the names of its city and category, all on the page already. */}
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: market.name, path: routes.market(market.slug) },
            { name: categoryName(category.slug), path: routes.category(category.slug, market.slug) },
            { name: task.title, path: routes.publicTask(task.slug) },
          ]),
        ]}
      />
      <PublicTaskScreen data={page.data} now={page.now} />
    </>
  );
}

export default withClientMessages('[locale]/(public)/tasks/[taskSlug]/page.tsx', PublicTaskPage);
