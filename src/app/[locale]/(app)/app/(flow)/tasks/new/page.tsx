import { withClientMessages } from '@/i18n/client-messages';
import { createHash } from 'node:crypto';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { findTaskTemplate, isTaskTemplateId, routes, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from '@/contracts';
import { carriedWords, handoffCode } from '@/modules/tasks/carried-words';
import { redeemClientInvite } from '@/modules/beta/actions';
import { clientInviteFor } from '@/modules/beta/server';
import { communityPostForTask } from '@/modules/community/service';
import { getFlags } from '@/modules/markets/queries';
import {
  draftTaskWithAi,
  postTaskAction,
  quoteTaskPrice,
  resolveTaskPhotos,
  searchTaskAddresses,
  uploadTaskPhoto,
} from '@/modules/tasks/actions';
import { homeMarketIdOf, phoneGateOpen, taskDrafter, taskPosting } from '@/modules/tasks/server';
import { requirePosterIdentity } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ClientInviteScreen } from '@/ui/screens/beta';
import { PostTaskScreen } from '@/ui/screens/posting';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('postTask');
}

/** The posting wizard (blueprint 02 J1). Posting needs a verified phone. */
function PostTaskPage({ searchParams }: PageProps<'/[locale]/app/tasks/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <PostTask searchParams={searchParams} />
    </Suspense>
  );
}

async function PostTask({ searchParams }: Pick<PageProps<'/[locale]/app/tasks/new'>, 'searchParams'>) {
  const [viewer, search] = await Promise.all([getViewer(), searchParams]);
  // The person's own words from the landing page's assistant (or the AI draft they chose there), a title, the service.
  const { initialCategory, title, describe } = carriedWords(search);
  // A draft made signed out on this device (/post, J-V5), carried through sign-up under this code.
  const handoff = handoffCode(search.handoff);
  // "Draft it with AI" on the landing page: draft from those words as the wizard opens.
  const wantsAiDraft = search.ai === '1' && Boolean(describe);
  // "Post again" (plan 4.2): one of the person's own finished tasks.
  const again = typeof search.again === 'string' && /^tsk_[A-Za-z0-9_-]{1,40}$/.test(search.again) ? search.again : undefined;
  // "Ask for help" (plan 9.10): one of the person's own community posts; its words are read from the post itself.
  const fromPostId = !again && typeof search.from === 'string' && /^cpo_[A-Za-z0-9_-]{1,60}$/.test(search.from) ? search.from : undefined;
  // "Post a task like this" (an example, blueprint 01 P2): only when no repeat or words of their own came along.
  const templateId = !again && !fromPostId && !describe && !title && isTaskTemplateId(search.template) ? search.template : undefined;
  // Signing in (and verifying a phone) comes back here with the same category, words and request.
  const here = routes.app.newTask({
    ...(initialCategory ? { category: initialCategory } : {}),
    ...(title ? { title } : {}),
    ...(describe ? { describe } : {}),
    ...(wantsAiDraft ? { ai: true } : {}),
    ...(again ? { again } : {}),
    ...(templateId ? { template: templateId } : {}),
    ...(fromPostId ? { fromPost: fromPostId } : {}),
    ...(handoff ? { handoff } : {}),
  });
  // Signed out: the same form at /post, with the same words (J-V5). Its "Post task" asks for the account. Post again
  // and a community post are the person's own, so those need signing in first.
  if (viewer.kind !== 'user') {
    redirect(again || fromPostId ? routes.signIn(here) : routes.postTask({ ...(initialCategory ? { category: initialCategory } : {}), ...(title ? { title } : {}), ...(describe ? { describe } : {}), ...(templateId ? { template: templateId } : {}) }));
  }
  const userId = viewer.user.id;
  // A market opening soon takes clients by invitation (J-V8): that step first, before the phone and the form.
  const clientInvite = await clientInviteFor(db, userId);
  if (clientInvite) return <ClientInviteScreen data={clientInvite} handlers={{ onRedeem: redeemClientInvite }} />;
  // A phone first (only where texts work, plan 9.2): sign-in's phone steps, inside the app (journeys on a phone, J-C2).
  if (!(await phoneGateOpen(userId))) redirect(routes.app.verifyPhone(here));
  // Risk may ask for an ID check before posting (blueprint 01 P2); it comes back here once it passes.
  await requirePosterIdentity(db, userId, await requestNow(), here);

  const [data, marketId, repeat, fromPost] = await Promise.all([
    taskPosting.pageData(userId),
    homeMarketIdOf(userId),
    again ? taskPosting.repeat(userId, again) : null,
    fromPostId ? communityPostForTask(db, userId, fromPostId) : null,
  ]);
  if (!data || !marketId) redirect(routes.app.home());
  const flags = await getFlags(marketId);
  // A per-person key, so a saved draft never shows up for someone else on a shared device. Posting a task again
  // keeps its own draft, so it never picks up (or overwrites) another one in progress.
  const draftStorageKey = `tasksnearme:post-task:${data.market.slug}:${createHash('sha256').update(userId).digest('hex').slice(0, 16)}${repeat && again ? `:again:${again}` : ''}:v1`;

  const aiDraftingEnabled = Boolean(flags.ai_drafting) && taskDrafter !== null;
  const botCheck = await botCheckForPage();
  // The example must be one this market offers (its category is in the market).
  const fromTemplate = templateId && data.templates?.some((template) => template.id === templateId) ? findTaskTemplate(templateId) : undefined;
  // Like "Post again", a start from an example or a post keeps its own tab draft (an unrelated draft in progress
  // never replaces it, and it never overwrites one).
  // So do words or a category carried in from the landing page or a search (sweep 2026-11-20, PT11): an older draft in
  // progress in the tab replaced them. Their key is a hash of what came in, so a reload of the same link restores it.
  const carried = !repeat && (initialCategory || title || describe) ? createHash('sha256').update([initialCategory ?? '', title, describe].join('\n')).digest('hex').slice(0, 12) : null;
  const storageKey = fromTemplate
    ? draftStorageKey.replace(/:v1$/, `:template:${fromTemplate.id}:v1`)
    : fromPost
      ? draftStorageKey.replace(/:v1$/, `:post:${fromPost.id}:v1`)
      : carried
        ? draftStorageKey.replace(/:v1$/, `:from:${carried}:v1`)
        : draftStorageKey;
  // The post's own words, within the wizard's limits; the person checks them like anything else.
  const postTitle = fromPost ? fromPost.title.replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX) : '';
  const postWords = fromPost ? fromPost.body.trim().slice(0, TASK_DESCRIPTION_MAX) : '';

  return (
    <PostTaskScreen
      data={{
        ...data,
        aiDraftingEnabled,
        ...(botCheck ? { botCheck } : {}),
        ...(wantsAiDraft && aiDraftingEnabled ? { autoDraft: true } : {}),
        draftStorageKey: storageKey,
        ...(repeat ? { repeat } : {}),
        ...(fromTemplate
          ? { initialTemplate: fromTemplate.id, initialCategory: fromTemplate.categorySlug }
          : initialCategory
            ? { initialCategory }
            : fromPost?.categorySlug && data.categories.some((category) => category.slug === fromPost.categorySlug)
              ? { initialCategory: fromPost.categorySlug }
              : {}),
        ...(title ? { initialTitle: title } : postTitle ? { initialTitle: postTitle } : {}),
        ...(describe ? { initialDescription: describe } : postWords ? { initialDescription: postWords } : {}),
        ...(fromPost ? { fromPost: { id: fromPost.id, title: fromPost.title } } : {}),
        ...(handoff ? { handoff } : {}),
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

export default withClientMessages('[locale]/(app)/app/(flow)/tasks/new/page.tsx', PostTaskPage);
