import { chargebackEvidencePack } from '@/modules/payments/evidence-pack';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * A booking's chargeback evidence pack as a JSON download, for finance (T-18; src/modules/payments/evidence-pack.ts).
 * Staff only after this session's two-step check, like every staff page. Anyone else, and a booking whose charge
 * was never disputed, get a 404 that looks like any missing file. Each download is in the audit log.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/admin/bookings/[bookingId]/evidence-pack'>) {
  const [{ bookingId }, viewer] = await Promise.all([ctx.params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  const file = staff ? await chargebackEvidencePack(db, staff, bookingId, await requestNow()) : null;
  if (!file) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const body = new TextEncoder().encode(JSON.stringify(file.pack, null, 2));
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
