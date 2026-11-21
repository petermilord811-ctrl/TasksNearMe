import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { findTaskTemplate, isTaskTemplateId, routes } from '@/contracts';
import { DEFAULT_MARKET_SLUG } from '@/modules/markets/default-market';
import { draftTaskWithAi, postTaskAction, uploadTaskPhoto } from '@/modules/tasks/actions';
import { carriedWords } from '@/modules/tasks/carried-words';
import { quoteTaskPriceSignedOut, searchTaskAddressesSignedOut } from '@/modules/tasks/guest-actions';
import { taskPosting } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { PostTaskScreen } from '@/ui/screens/posting';

/** A form, not content: never indexed, and not in the sitemap (src/app/sitemap.ts lists pages one by one). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.post');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } };
}

/**
 * The post form before an account (visitor-to-first-post walk, J-V5): the app's wizard for someone not signed in,
 * kept on their device. "Post task" asks for the account (sign-up, the phone where texts work, an invite where the
 * market is opening soon), then the app's form takes the draft over and opens on its review step. The account's tools
 * (photos, "Rewrite with AI") wait until then; only the address search and the quote run signed out, rate-limited.
 */
function PostPage({ searchParams }: PageProps<'/[locale]/post'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <SignedOutPost searchParams={searchParams} />
    </Suspense>
  );
}

async function SignedOutPost({ searchParams }: Pick<PageProps<'/[locale]/post'>, 'searchParams'>) {
  const [viewer, search] = await Promise.all([getViewer(), searchParams]);
  const { initialCategory, title, describe } = carriedWords(search);
  const templateId = !describe && !title && isTaskTemplateId(search.template) ? search.template : undefined;
  const carried = { ...(initialCategory ? { category: initialCategory } : {}), ...(title ? { title } : {}), ...(describe ? { describe } : {}), ...(templateId ? { template: templateId } : {}) };
  // Signed in: the app's own form, with the same words.
  if (viewer.kind === 'user') redirect(routes.app.newTask(carried));
  const data = await taskPosting.guestPageData(DEFAULT_MARKET_SLUG);
  if (!data) notFound();
  const fromTemplate = templateId && data.templates?.some((template) => template.id === templateId) ? findTaskTemplate(templateId) : undefined;
  return (
    <PostTaskScreen
      data={{
        ...data,
        // One draft per tab for someone not signed in; the sign-in and sign-up pages clear it unless it's on its way
        // to the account (personal-drafts.ts).
        draftStorageKey: `tasksnearme:post-task:${data.market.slug}:guest:v1`,
        ...(fromTemplate ? { initialTemplate: fromTemplate.id, initialCategory: fromTemplate.categorySlug } : initialCategory ? { initialCategory } : {}),
        ...(title ? { initialTitle: title } : {}),
        ...(describe ? { initialDescription: describe } : {}),
      }}
      handlers={{
        onSearchAddresses: searchTaskAddressesSignedOut,
        onQuote: quoteTaskPriceSignedOut,
        // Never called signed out (no photos, no AI, and "Post task" hands over to sign-up); each refuses without a session.
        onUploadPhoto: uploadTaskPhoto,
        onDraftWithAi: draftTaskWithAi,
        onPost: postTaskAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/(public)/post/page.tsx', PostPage);
