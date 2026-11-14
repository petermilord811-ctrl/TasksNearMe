import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LEGAL_DOCS } from '@/contracts';
import { getLegalDoc } from '@/modules/content/loaders';
import { LegalDocScreen } from '@/ui/screens/content/legal-doc-screen';
import { publicPageMetadata } from '@/i18n/metadata';
import { routes } from '@/contracts';

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/legal/[doc]'>): Promise<Metadata> {
  const doc = getLegalDoc((await params).doc);
  if (!doc) return {};
  // Drafts aren't in effect, so keep them out of search results (and out of the sitemap).
  return {
    ...(await publicPageMetadata({ path: routes.legal(doc.doc), title: doc.title, description: doc.summary })),
    ...(doc.status === 'draft' ? { robots: { index: false } } : {}),
  };
}

export default async function LegalDocPage({ params }: PageProps<'/[locale]/legal/[doc]'>) {
  const doc = getLegalDoc((await params).doc);
  if (!doc) notFound();
  return <LegalDocScreen data={doc} />;
}
