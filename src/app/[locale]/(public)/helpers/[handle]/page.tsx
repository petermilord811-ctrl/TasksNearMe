import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getHelperProfilePageData, listHelperHandles } from '@/modules/marketing/queries';
import { HelperProfileScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateStaticParams() {
  const handles = await listHelperHandles();
  // At least one param is required; a missing helper renders the not-found page.
  return (handles.length > 0 ? handles : ['no-helpers-yet']).map((handle) => ({ handle }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/helpers/[handle]'>): Promise<Metadata> {
  const { handle } = await params;
  const data = await getHelperProfilePageData(handle);
  if (!data) return {};
  return { title: data.helper.displayName, description: data.helper.headline, alternates: await languageAlternates(routes.helperProfile(handle)) };
}

/** First name and last initial, neighborhood-level area, badges, services, reviews, work samples. */
export default async function HelperProfilePage({ params }: PageProps<'/[locale]/helpers/[handle]'>) {
  const data = await getHelperProfilePageData((await params).handle);
  if (!data) notFound();
  return <HelperProfileScreen data={data} />;
}
