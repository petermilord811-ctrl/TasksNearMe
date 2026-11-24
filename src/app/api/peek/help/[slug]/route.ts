import { isAppLocale, type HelpPeekData } from '@/contracts';
import { getHelpArticle } from '@/modules/content/loaders';

/** A help article for the peek sheet (2026-11-23), in the page's language (`?locale=`); 404 when there's no such article. */
export async function GET(request: Request, { params }: RouteContext<'/api/peek/help/[slug]'>): Promise<Response> {
  const { slug } = await params;
  const asked = new URL(request.url).searchParams.get('locale');
  const article = getHelpArticle(String(slug), isAppLocale(asked) ? asked : 'en');
  if (!article) return Response.json({ error: 'not_found' }, { status: 404 });
  const data: HelpPeekData = { kind: 'article', data: article };
  return Response.json(data, { headers: { 'cache-control': 'public, max-age=300' } });
}
