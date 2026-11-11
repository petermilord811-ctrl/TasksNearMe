import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CATEGORY_SLUGS, routes, type CategorySlug } from '@/contracts';
import { getFlags } from '@/modules/markets/queries';
import {
  draftTaskWithAi,
  postTaskAction,
  quoteTaskPrice,
  resolveTaskPhotos,
  searchTaskAddresses,
  uploadTaskPhoto,
} from '@/modules/tasks/actions';
import { hasVerifiedPhone, homeMarketIdOf, taskDrafter, taskPosting } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { PostTaskScreen } from '@/ui/screens/posting';

export const metadata: Metadata = { title: 'Post a task', robots: { index: false } };

/** The posting wizard (blueprint 02 J1). Posting needs a verified phone. */
export default function PostTaskPage({ searchParams }: PageProps<'/app/tasks/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <PostTask searchParams={searchParams} />
    </Suspense>
  );
}

async function PostTask({ searchParams }: Pick<PageProps<'/app/tasks/new'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newTask()));
  const userId = viewer.user.id;
  // The sign-in flow asks for (and verifies) a phone when the destination needs one.
  if (!(await hasVerifiedPhone(userId))) redirect(routes.signIn(routes.app.newTask()));

  const [data, marketId, search] = await Promise.all([taskPosting.pageData(userId), homeMarketIdOf(userId), searchParams]);
  if (!data || !marketId) redirect(routes.app.home());
  const flags = await getFlags(marketId);
  const category = typeof search.category === 'string' ? search.category : undefined;
  const initialCategory = category && (CATEGORY_SLUGS as readonly string[]).includes(category) ? (category as CategorySlug) : undefined;
  // A per-person key, so a saved draft never shows up for someone else on a shared device.
  const draftStorageKey = `tasksnearme:post-task:${data.market.slug}:${createHash('sha256').update(userId).digest('hex').slice(0, 16)}:v1`;

  return (
    <PostTaskScreen
      data={{
        ...data,
        aiDraftingEnabled: Boolean(flags.ai_drafting) && taskDrafter !== null,
        draftStorageKey,
        ...(initialCategory ? { initialCategory } : {}),
      }}
      handlers={{
        onDraftWithAi: draftTaskWithAi,
        onSearchAddresses: searchTaskAddresses,
        onUploadPhoto: uploadTaskPhoto,
        onQuote: quoteTaskPrice,
        onPost: postTaskAction,
        onResolvePhotos: resolveTaskPhotos,
      }}
    />
  );
}
