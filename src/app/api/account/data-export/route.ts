import { readReadyExport } from '@/modules/privacy/requests';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * The signed-in person's prepared copy of their data (src/modules/privacy), as a JSON download, while it's
 * ready (7 days). Anyone else, or no ready copy, gets a 404 that looks like any missing file.
 */
export async function GET() {
  const viewer = await getViewer();
  const file = viewer.kind === 'user' ? await readReadyExport(db, fileStorage, viewer.user.id, await requestNow()) : null;
  if (!file) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(file.body.length),
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
