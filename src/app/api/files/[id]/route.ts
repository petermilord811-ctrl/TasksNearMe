import { eq } from 'drizzle-orm';
import { createFileStorage } from '@/integrations/storage';
import { canViewFile } from '@/modules/files/access';
import { canViewRelatedFile, isCurrentProfilePhoto } from '@/modules/files/related-access';
import { files } from '@/modules/tasks/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';

const storage = createFileStorage();

/** Serves uploaded files after an access check. Unknown and forbidden files look the same (404). */
export async function GET(_request: Request, ctx: RouteContext<'/api/files/[id]'>) {
  const { id } = await ctx.params;
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const viewer = await getViewer();
  const userId = viewer.kind === 'user' ? viewer.user.id : null;
  const allowed =
    file &&
    (canViewFile(file, { userId, isStaff: viewer.kind === 'user' && viewer.user.staffRoles.length > 0 }) ||
      (await isCurrentProfilePhoto(db, file)) ||
      (userId !== null && (await canViewRelatedFile(db, file, userId, await requestNow()))));
  const body = allowed && !file.storageKey.startsWith('public/') ? await storage.get(file.storageKey) : null;
  if (!file || !allowed || !body) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(body.length),
      // Private files must never land in shared caches.
      'Cache-Control': file.kind === 'work_sample' ? 'public, max-age=86400' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
