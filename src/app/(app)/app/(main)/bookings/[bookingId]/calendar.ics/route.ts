import { routes } from '@/contracts';
import { bookingCalendarFile } from '@/modules/bookings/calendar';
import { getBookingView } from '@/modules/bookings/hub';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';

/** "Add to calendar": an .ics file for the booking's client or helper (anyone else: 404). */
export async function GET(request: Request, context: RouteContext<'/app/bookings/[bookingId]/calendar.ics'>) {
  const [{ bookingId }, viewer] = await Promise.all([context.params, getViewer()]);
  if (viewer.kind !== 'user') return new Response(null, { status: 404 });
  const now = await requestNow();
  const view = await getBookingView(hubDeps(), viewer.user.id, bookingId, now);
  if (!view || view.status === 'canceled') return new Response(null, { status: 404 });
  const url = new URL(routes.app.booking(view.id), request.url).toString();
  return new Response(bookingCalendarFile(view, url, now), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="booking-${view.id}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
