import { isAppLocale, type HelpPeekData } from '@/contracts';
import { getHelpCenterData } from '@/modules/content/loaders';

/** The help center for the peek sheet (2026-11-23): its topics and articles in the page's language (`?locale=`). */
export function GET(request: Request): Response {
  const asked = new URL(request.url).searchParams.get('locale');
  const data: HelpPeekData = { kind: 'center', data: getHelpCenterData(isAppLocale(asked) ? asked : 'en') };
  return Response.json(data, { headers: { 'cache-control': 'public, max-age=300' } });
}
