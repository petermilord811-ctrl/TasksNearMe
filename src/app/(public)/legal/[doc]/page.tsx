import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LEGAL_DOCS } from '@/contracts';
import { getLegalDoc } from '@/modules/content/loaders';
import { PageSkeleton } from '@/ui/components';
import { LegalDocScreen } from '@/ui/screens/content';

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<'/legal/[doc]'>): Promise<Metadata> {
  const doc = getLegalDoc((await params).doc);
  if (!doc) return {};
  // Drafts aren't in effect, so keep them out of search results.
  return { title: doc.title, description: doc.summary, ...(doc.status === 'draft' ? { robots: { index: false } } : {}) };
}

export default function LegalDocPage({ params }: PageProps<'/legal/[doc]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <LegalDocument params={params} />
    </Suspense>
  );
}

async function LegalDocument({ params }: Pick<PageProps<'/legal/[doc]'>, 'params'>) {
  const doc = getLegalDoc((await params).doc);
  if (!doc) notFound();
  return <LegalDocScreen data={doc} />;
}
