import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getHelperProfilePageData, listHelperHandles } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { helperProfileNode } from '@/modules/seo/structured-data';
import { HelperProfileScreen } from '@/ui/screens/public';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
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
  return publicPageMetadata({
    path: routes.helperProfile(handle),
    title: data.helper.displayName,
    description: data.helper.headline,
    kind: { type: 'profile', username: handle },
  });
}

/** First name and last initial, neighborhood-level area, badges, services, reviews, work samples. */
async function HelperProfilePage({ params }: PageProps<'/[locale]/helpers/[handle]'>) {
  const { handle } = await params;
  const data = await getHelperProfilePageData(handle);
  if (!data) notFound();
  const [context, categoryName] = await Promise.all([structuredDataContext(), categoryNames()]);
  return (
    <>
      <JsonLd nodes={[helperProfileNode(context, { data, path: routes.helperProfile(handle), categoryName })]} />
      <HelperProfileScreen data={data} />
    </>
  );
}

export default withClientMessages('[locale]/(public)/helpers/[handle]/page.tsx', HelperProfilePage);
