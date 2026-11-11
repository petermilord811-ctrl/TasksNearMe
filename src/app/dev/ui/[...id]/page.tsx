import { Suspense } from 'react';
import { PreviewHost } from './preview-host';

/**
 * Renders one preview alone (used by reviewers and the screenshot/axe harness).
 * Preview ids contain "/", so this is a catch-all route.
 */
export default function PreviewPage({ params }: { params: Promise<{ id: string[] }> }) {
  return (
    <Suspense fallback={null}>
      <PreviewById params={params} />
    </Suspense>
  );
}

async function PreviewById({ params }: { params: Promise<{ id: string[] }> }) {
  const { id } = await params;
  return <PreviewHost id={id.map(decodeURIComponent).join('/')} />;
}
