import type { LegalPeekData } from '@/contracts';
import { getLegalDoc } from '@/modules/content/loaders';

/** A legal document for the peek sheet (2026-11-23), as its page shows it; 404 for a document that isn't published. */
export async function GET(_request: Request, { params }: RouteContext<'/api/peek/legal/[doc]'>): Promise<Response> {
  const { doc } = await params;
  const data: LegalPeekData | null = getLegalDoc(String(doc));
  if (!data) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(data, { headers: { 'cache-control': 'public, max-age=300' } });
}
