import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTaskPageData, listRecentTaskSlugs } from '@/modules/marketing/queries';
import { PublicTaskScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
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
  return { title: task.title, description: task.excerpt, alternates: await languageAlternates(routes.publicTask(taskSlug)), ...(acceptingOffers ? {} : { robots: { index: false } }) };
}

/** What anyone may see about a task: general area only, never the address or photos. */
async function PublicTaskPage({ params }: PageProps<'/[locale]/tasks/[taskSlug]'>) {
  const page = await getPublicTaskPageData((await params).taskSlug);
  if (!page) notFound();
  return <PublicTaskScreen data={page.data} now={page.now} />;
}

export default withClientMessages('[locale]/(public)/tasks/[taskSlug]/page.tsx', PublicTaskPage);
