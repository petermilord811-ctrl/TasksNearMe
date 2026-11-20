import { eq } from 'drizzle-orm';
import { createFileStorage } from '@/integrations/storage';
import { canViewFile } from '@/modules/files/access';
import { PHOTO_WIDTHS, type PhotoWidth } from '@/modules/files/photos';
import { canViewRelatedFile, isCurrentProfilePhoto } from '@/modules/files/related-access';
import { resizedImage } from '@/modules/files/resize';
import { staffActorOf } from '@/modules/support/staff';
import { files } from '@/modules/tasks/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';

const storage = createFileStorage();

/**
 * Serves uploaded files after an access check. Unknown and forbidden files look the same (404). `?w=256` or
 * `?w=1280` serves an image at most that wide (photos.ts PHOTO_WIDTHS), made on request after the same check.
 */
export async function GET(request: Request, ctx: RouteContext<'/api/files/[id]'>) {
  const { id } = await ctx.params;
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const viewer = await getViewer();
  const userId = viewer.kind === 'user' ? viewer.user.id : null;
  // Staff only after this session's two-step check, like every staff page (not just a staff role).
  const isStaff = viewer.kind === 'user' && staffActorOf(viewer.user) !== null;
  const allowed =
    file &&
    (canViewFile(file, { userId, isStaff }) ||
      (await isCurrentProfilePhoto(db, file)) ||
      (userId !== null && (await canViewRelatedFile(db, file, userId, await requestNow()))));
  // An empty key: the retention timer deleted the file itself and kept only the record (a receipt line).
  if (!file || !allowed || !file.storageKey || file.storageKey.startsWith('public/')) return new Response('Not found', { status: 404 });

  const asked = Number(new URL(request.url).searchParams.get('w'));
  const width = (PHOTO_WIDTHS as readonly number[]).includes(asked) ? (asked as PhotoWidth) : null;
  // A file's bytes never change (a new upload is a new file), so asking again costs a 304. A private file is asked
  // again on every use, after the access check above: once someone signs out or loses access, the browser can't show
  // its copy (security review 2026-11-20). Private files must never land in shared caches.
  const cacheControl = file.kind === 'work_sample' ? 'public, max-age=86400' : 'private, no-cache';
  const etag = `"${file.id}${width ? `-w${width}` : ''}"`;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } });
  const body = await storage.get(file.storageKey);
  if (!body) return new Response('Not found', { status: 404 });
  const smaller = width !== null && file.contentType.startsWith('image/') && Math.max(file.width, file.height) > width;
  const served = smaller ? await resizedImage(body, width) : body;

  return new Response(new Uint8Array(served), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(served.length),
      'Cache-Control': cacheControl,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
