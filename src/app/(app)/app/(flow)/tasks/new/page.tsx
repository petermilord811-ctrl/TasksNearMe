import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CATEGORY_SLUGS, routes, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX, type CategorySlug } from '@/contracts';
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
  const [viewer, search] = await Promise.all([getViewer(), searchParams]);
  const category = typeof search.category === 'string' ? search.category : undefined;
  const initialCategory = category && (CATEGORY_SLUGS as readonly string[]).includes(category) ? (category as CategorySlug) : undefined;
  // The person's own words from the landing page's assistant, or the AI draft they chose there ("Use this draft"):
  // plain text, spaces tidied, line breaks kept, within the description's limit.
  const describe =
    typeof search.describe === 'string'
      ? search.describe.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, TASK_DESCRIPTION_MAX)
      : '';
  // The AI draft's title, when they used one.
  const title = typeof search.title === 'string' ? search.title.replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX) : '';
  // "Draft it with AI" on the landing page: draft from those words as the wizard opens.
  const wantsAiDraft = search.ai === '1' && Boolean(describe);
  // "Post again" (plan 4.2): one of the person's own finished tasks.
  const again = typeof search.again === 'string' && /^tsk_[A-Za-z0-9_-]{1,40}$/.test(search.again) ? search.again : undefined;
  // Signing in (and verifying a phone) comes back here with the same category, words and request.
  const here = routes.app.newTask({
    ...(initialCategory ? { category: initialCategory } : {}),
    ...(title ? { title } : {}),
    ...(describe ? { describe } : {}),
    ...(wantsAiDraft ? { ai: true } : {}),
    ...(again ? { again } : {}),
  });
  if (viewer.kind !== 'user') redirect(routes.signIn(here));
  const userId = viewer.user.id;
  // The sign-in flow asks for (and verifies) a phone when the destination needs one.
  if (!(await hasVerifiedPhone(userId))) redirect(routes.signIn(here));

  const [data, marketId, repeat] = await Promise.all([taskPosting.pageData(userId), homeMarketIdOf(userId), again ? taskPosting.repeat(userId, again) : null]);
  if (!data || !marketId) redirect(routes.app.home());
  const flags = await getFlags(marketId);
  // A per-person key, so a saved draft never shows up for someone else on a shared device. Posting a task again
  // keeps its own draft, so it never picks up (or overwrites) another one in progress.
  const draftStorageKey = `tasksnearme:post-task:${data.market.slug}:${createHash('sha256').update(userId).digest('hex').slice(0, 16)}${repeat && again ? `:again:${again}` : ''}:v1`;

  const aiDraftingEnabled = Boolean(flags.ai_drafting) && taskDrafter !== null;

  return (
    <PostTaskScreen
      data={{
        ...data,
        aiDraftingEnabled,
        ...(wantsAiDraft && aiDraftingEnabled ? { autoDraft: true } : {}),
        draftStorageKey,
        ...(repeat ? { repeat } : {}),
        ...(initialCategory ? { initialCategory } : {}),
        ...(title ? { initialTitle: title } : {}),
        ...(describe ? { initialDescription: describe } : {}),
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
