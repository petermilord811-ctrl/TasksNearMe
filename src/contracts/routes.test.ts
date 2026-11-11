import { describe, expect, it } from 'vitest';
import { deskExactAddress } from '@/fixtures';
import { routes } from './routes';

describe('routes', () => {
  it('builds app paths with encoded segments and query strings', () => {
    expect(routes.app.booking('bkg_1')).toBe('/app/bookings/bkg_1');
    expect(routes.app.requestHelper('jordan-t', { fromBookingId: 'bkg_1' })).toBe(
      '/app/helpers/jordan-t/request?from=booking%3Abkg_1',
    );
    expect(routes.app.offers()).toBe('/app/offers');
    expect(routes.app.offers('inv_9')).toBe('/app/offers?invite=inv_9');
    expect(routes.signIn('/app/tasks/new')).toBe('/sign-in?next=%2Fapp%2Ftasks%2Fnew');
  });

  it('keeps preview ids as path segments', () => {
    expect(routes.dev.preview('price-breakdown/desk-poster')).toBe('/dev/ui/price-breakdown/desk-poster');
  });

  it('builds a Google Maps search link without access notes', () => {
    const href = routes.external.googleMapsSearch(deskExactAddress);
    expect(href).toBe(
      'https://www.google.com/maps/search/?api=1&query=1234%20Example%20Lane%2C%20Apt%202B%2C%20Austin%2C%20TX%2078723',
    );
    expect(href).not.toContain('Buzz');
  });
});
