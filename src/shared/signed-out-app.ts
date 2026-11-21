import { CATEGORY_SLUGS, routes, type CategorySlug } from '@/contracts';

/**
 * Where a visitor to /app without a session cookie goes (the proxy's optimistic check; the app layout checks the
 * session itself). The app's post form goes to the same form for someone without an account (/post, J-V5) with the
 * words a link carried, so every "Post a task" works signed out. Post again and a community post are the person's
 * own, so those sign in, as everything else does, and come back.
 */
export function signedOutAppDestination(path: string, params: URLSearchParams): string {
  if (path === '/app/tasks/new' && !params.has('again') && !params.has('from')) {
    const category = params.get('category');
    return routes.postTask({
      ...(category && (CATEGORY_SLUGS as readonly string[]).includes(category) ? { category: category as CategorySlug } : {}),
      ...(params.get('title') ? { title: params.get('title')! } : {}),
      ...(params.get('describe') ? { describe: params.get('describe')! } : {}),
      ...(params.get('template') ? { template: params.get('template')! } : {}),
    });
  }
  const search = params.toString();
  return routes.signIn(`${path}${search ? `?${search}` : ''}`);
}
