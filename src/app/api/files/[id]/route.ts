import { eq } from 'drizzle-orm';
import { createFileStorage } from '@/integrations/storage';
import { canViewFile } from '@/modules/files/access';
import { PHOTO_WIDTHS, type PhotoWidth } from '@/modules/files/photos';
import { canViewRelatedFile, isCurrentProfilePhoto } from '@/modules/files/related-access';
import { resizedImage } from '@/modules/files/resize';
import { cachedResize } from '@/modules/files/resize-cache';
import { readStaffFileToken } from '@/modules/files/staff-file-token';
import { staffActorOf } from '@/modules/support/staff';
import { auditRoleOf } from '@/modules/tasks/moderation';
import { files } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { newId } from '@/platform/db/ids';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';

const storage = createFileStorage();

class MissingFile extends Error {}

/**
 * Serves uploaded files after an access check. Unknown and forbidden files look the same (404). `?w=256` or
 * `?w=1280` serves an image at most that wide (photos.ts PHOTO_WIDTHS), made after the same check and kept a while
 * (resize-cache.ts). Staff open another person's file only with `?t=`, a token from the page that showed it to them
 * (staff-file-token.ts), and each such fetch is audited with that page's context (security review SEC24).
 */
export async function GET(request: Request, ctx: RouteContext<'/api/files/[id]'>) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const viewer = await getViewer();
  const userId = viewer.kind === 'user' ? viewer.user.id : null;
  const now = await requestNow();
  const ownAccess =
    file &&
    (canViewFile(file, { userId }) || (await isCurrentProfilePhoto(db, file)) || (userId !== null && (await canViewRelatedFile(db, file, userId, now))));
  // Staff only after this session's two-step check, like every staff page (not just a staff role), and only with the
  // token minted for them by a page that showed them this file.
  const staff = !ownAccess && file && viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  const token = url.searchParams.get('t');
  const claim = staff && token ? readStaffFileToken(token, now) : null;
  const staffAccess = Boolean(claim && file && claim.fileId === file.id && claim.staffUserId === staff?.id);
  // An empty key: the retention timer deleted the file itself and kept only the record (a receipt line).
  if (!file || !(ownAccess || staffAccess) || !file.storageKey || file.storageKey.startsWith('public/')) return new Response('Not found', { status: 404 });
  const storageKey = file.storageKey;

  const asked = Number(url.searchParams.get('w'));
  const width = (PHOTO_WIDTHS as readonly number[]).includes(asked) ? (asked as PhotoWidth) : null;
  // A file's bytes never change (a new upload is a new file), so asking again costs a 304. A private file is asked
  // again on every use, after the access check above: once someone signs out or loses access, the browser can't show
  // its copy (security review 2026-11-20). Private files must never land in shared caches.
  const cacheControl = file.kind === 'work_sample' ? 'public, max-age=86400' : 'private, no-cache';
  const etag = `"${file.id}${width ? `-w${width}` : ''}"`;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } });
  // A GIF (chat, 2026-11-24) is always served as stored: a smaller copy would be a still WebP.
  const smaller = width !== null && file.contentType.startsWith('image/') && file.contentType !== 'image/gif' && Math.max(file.width, file.height) > width;
  const served = smaller && width !== null
    ? await cachedResize(`${file.id}:${width}`, async () => {
        const body = await storage.get(storageKey);
        if (!body) throw new MissingFile();
        return resizedImage(body, width);
      }).catch((error: unknown) => {
        if (error instanceof MissingFile) return null;
        throw error;
      })
    : await storage.get(storageKey);
  if (!served) return new Response('Not found', { status: 404 });
  if (staffAccess && staff && claim) {
    await db.insert(auditLog).values({
      id: newId('aud'),
      actorId: staff.id,
      actorRole: auditRoleOf(staff.roles),
      action: 'file.viewed',
      targetType: 'file',
      targetId: file.id,
      metadata: { context: claim.context, ownerUserId: file.ownerUserId, kind: file.kind, ...(width ? { width } : {}) },
    });
  }

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
