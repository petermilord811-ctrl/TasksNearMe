import { revalidateTag } from 'next/cache';
import { marketTag } from '@/modules/marketing/queries';
import { markets } from '@/modules/markets/schema';
import { db } from '@/platform/db/client';

/**
 * Dev only. Drops the cached public data (`'use cache'` entries tagged markets, tasks, helpers) so pages
 * read the database again. The e2e setup calls it after reseeding, since a reseed changes rows behind
 * the app's back and the long-running dev server would otherwise keep serving the old pages.
 * Server actions already update their own tags; this is only for changes made outside the app.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  const rows = await db.select({ slug: markets.slug }).from(markets);
  const tags = ['markets', 'tasks', 'helpers', ...rows.map((row) => marketTag(row.slug))];
  // expire 0: the next request is a blocking miss, never stale content.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
