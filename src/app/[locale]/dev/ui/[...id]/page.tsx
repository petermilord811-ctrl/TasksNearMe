import { withClientMessages } from '@/i18n/client-messages';
import { Suspense } from 'react';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { PreviewHost } from './preview-host';

/**
 * Renders one preview alone (used by reviewers and the screenshot/axe harness).
 * Preview ids contain "/", so this is a catch-all route.
 */
function PreviewPage({ params }: { params: Promise<{ id: string[] }> }) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <PreviewById params={params} />
    </Suspense>
  );
}

async function PreviewById({ params }: { params: Promise<{ id: string[] }> }) {
  const { id } = await params;
  return <PreviewHost id={id.map(decodeURIComponent).join('/')} />;
}

export default withClientMessages('[locale]/dev/ui/[...id]/page.tsx', PreviewPage);
