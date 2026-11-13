import { documentForToken } from '@/modules/verification/staff';
import { staffActorOf } from '@/modules/support/staff';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * A proof-of-address document, for the staff member who asked to see it (a logged reason) and only for
 * a few minutes (src/modules/verification/staff.ts). Photos open in the browser; PDFs download, so a PDF's
 * own scripts never run on our domain. Anything else looks like a missing file (404).
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/verification-documents/[token]'>) {
  const { token } = await ctx.params;
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  const secret = process.env.BETTER_AUTH_SECRET;
  const document = secret ? await documentForToken(db, fileStorage, token, staff, secret, await requestNow()) : null;
  if (!document) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const pdf = document.contentType === 'application/pdf';
  return new Response(new Uint8Array(document.body), {
    headers: {
      'Content-Type': document.contentType,
      'Content-Length': String(document.body.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Referrer-Policy': 'no-referrer',
      'Content-Disposition': pdf ? 'attachment; filename="proof-of-address.pdf"' : 'inline',
    },
  });
}
