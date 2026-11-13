import { toNextJsHandler } from 'better-auth/next-js';
import { authPathAllowed } from '@/modules/accounts/auth-routes';
import { auth } from '@/platform/auth/auth';

const handler = toNextJsHandler(auth);
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

/**
 * Better Auth's HTTP endpoints, limited to what browsers need: the providers' redirects back after Google or
 * Microsoft (src/modules/accounts/auth-routes.ts). Everything else goes through the app's Server Actions.
 */
export async function GET(request: Request): Promise<Response> {
  return authPathAllowed(new URL(request.url).pathname) ? handler.GET(request) : notFound();
}

export async function POST(request: Request): Promise<Response> {
  return authPathAllowed(new URL(request.url).pathname) ? handler.POST(request) : notFound();
}
