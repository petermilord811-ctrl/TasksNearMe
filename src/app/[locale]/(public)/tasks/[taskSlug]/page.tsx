import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTaskPageData, listRecentTaskSlugs } from '@/modules/marketing/queries';
import { PublicTaskScreen } from '@/ui/screens/public';

export async function generateStaticParams() {
  const slugs = await listRecentTaskSlugs();
  // At least one param is required; a missing task renders the not-found page.
  return (slugs.length > 0 ? slugs : ['no-open-tasks']).map((taskSlug) => ({ taskSlug }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>): Promise<Metadata> {
  const page = await getPublicTaskPageData((await params).taskSlug);
  if (!page) return {};
  const { task, acceptingOffers } = page.data;
  // Closed tasks stay reachable for links but drop out of search results.
  return { title: task.title, description: task.excerpt, ...(acceptingOffers ? {} : { robots: { index: false } }) };
}

/** What anyone may see about a task: general area only, never the address or photos. */
export default async function PublicTaskPage({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>) {
  const page = await getPublicTaskPageData((await params).taskSlug);
  if (!page) notFound();
  return <PublicTaskScreen data={page.data} now={page.now} />;
}
