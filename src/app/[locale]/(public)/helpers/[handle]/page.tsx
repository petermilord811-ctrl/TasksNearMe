import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getHelperProfilePageData, listHelperHandles } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { helperProfileIndexable, KEEP_OUT_OF_SEARCH } from '@/modules/seo/indexable';
import { helperProfileNode } from '@/modules/seo/structured-data';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { MarketTime } from '@/ui/lib/market-time';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateStaticParams() {
  const handles = await listHelperHandles(searchEngineRows());
  // At least one param is required; a missing helper renders the not-found page.
  return (handles.length > 0 ? handles : ['no-helpers-yet']).map((handle) => ({ handle }));
}

/** What search engines read: the public's profile (src/shared/sample-data.ts), whoever is visiting. */
export async function generateMetadata({ params }: PageProps<'/[locale]/helpers/[handle]'>): Promise<Metadata> {
  const { handle } = await params;
  const data = await getHelperProfilePageData(handle, searchEngineRows());
  // Missing, or a sample person where samples are hidden (testers still see them): no name, and never in search.
  if (!data) return KEEP_OUT_OF_SEARCH;
  return {
    ...(await publicPageMetadata({
      path: routes.helperProfile(handle),
      title: data.helper.displayName,
      description: data.helper.headline,
      kind: { type: 'profile', username: handle },
    })),
    // A profile with no completed task or review yet adds nothing to search (src/modules/seo/indexable.ts).
    ...(helperProfileIndexable(data.helper) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/**
 * First name and last initial, neighborhood-level area, badges, services, reviews, work samples. A helper nobody may
 * see is a real 404 (outside Suspense); the profile is drawn for the visitor inside Suspense, so a sample person
 * answers not found to the public where samples are hidden (src/shared/sample-data.ts).
 */
async function HelperProfilePage({ params }: PageProps<'/[locale]/helpers/[handle]'>) {
  const { handle } = await params;
  if (!(await getHelperProfilePageData(handle, 'all'))) notFound();
  const [indexed, context, categoryName] = await Promise.all([getHelperProfilePageData(handle, searchEngineRows()), structuredDataContext(), categoryNames()]);
  return (
    <>
      {indexed && <JsonLd nodes={[helperProfileNode(context, { data: indexed, path: routes.helperProfile(handle), categoryName })]} />}
      <Suspense fallback={<PageSkeleton variant="detail" />}>
        <HelperProfile handle={handle} />
      </Suspense>
    </>
  );
}

async function HelperProfile({ handle }: { handle: string }) {
  const data = await getHelperProfilePageData(handle, await requestRows());
  // A sample person for the public. The page is already streaming, so this answers 200 with noindex (Next adds it).
  if (!data) notFound();
  return <MarketTime timeZone={data.timeZone}><HelperProfileScreen data={data} /></MarketTime>;
}

export default withClientMessages('[locale]/(public)/helpers/[handle]/page.tsx', HelperProfilePage);
