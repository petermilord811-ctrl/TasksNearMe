/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type HelperProfilePageData } from '@/contracts';
import { jordanProfilePageData, jordanProfileWithSlotsData, leeProfilePageData, samProfilePageData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import helperProfile from '../../../../messages/en/ui/helperProfile.json';
import { HelperProfileScreen } from './helper-profile-screen';

afterEach(cleanup);

function show(data: HelperProfilePageData = samProfilePageData) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, helperProfile }}><HelperProfileScreen data={data} /></NextIntlClientProvider>);
}

describe('HelperProfileScreen', () => {
  it('shows supplied openings and omits the section when no slots are supplied', () => {
    const view = show(jordanProfileWithSlotsData);
    expect(within(screen.getByRole('region', { name: 'Open times' })).getAllByRole('link', { name: 'Request this time' })).toHaveLength(2);
    view.unmount();
    show(jordanProfilePageData);
    expect(screen.queryByRole('region', { name: 'Open times' })).not.toBeInTheDocument();
  });

  it('links the booking request to the supplied helper and shows the recent review count', () => {
    show();
    // The card's button, and on phones the one that stays in reach at the bottom (audit L19): both to the same request.
    const requests = screen.getAllByRole('link', { name: 'Request Sam K.' });
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).toHaveAttribute('href', routes.app.requestHelper(samProfilePageData.helper.handle));
    expect(screen.getByText('Showing the 4 most recent of 112 reviews')).toBeInTheDocument();
    expect(screen.getByText('Travels up to about 6 miles from Hyde Park')).toBeInTheDocument();
    expect(screen.getByText('Member since May 2024')).toBeInTheDocument();
    expect(screen.getByText('140 tasks completed')).toBeInTheDocument();
    expect(screen.getByText('Usually replies within an hour')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sam K.');
  });

  it('uses the supplied service prices and includes full dated verification badges', () => {
    show();
    const services = screen.getByRole('region', { name: 'Services' });
    expect(within(services).getByText('from $50.00')).toBeInTheDocument();
    expect(within(services).getByText('$38.00/h, 2 h minimum')).toBeInTheDocument();
    expect(within(services).getByText(samProfilePageData.services[0]!.description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ID verified · Jan 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Background checked · Jan 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phone verified' })).toBeInTheDocument();
  });

  it('hides absent tools and work samples and shows remote availability', () => {
    show(leeProfilePageData);
    expect(screen.queryByRole('region', { name: 'Tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Work samples' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Languages' })).toHaveTextContent('Vietnamese');
    expect(screen.getByText('Remote OK')).toBeInTheDocument();
  });

  it('shows the founding badge and empty reviews for a new helper', () => {
    show(jordanProfilePageData);
    expect(screen.getByText('Founding helper #63')).toBeInTheDocument();
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the/)).not.toBeInTheDocument();
    expect(screen.queryByText('Remote OK')).not.toBeInTheDocument();
  });

  it('omits empty languages and the recent-review note when every review is shown', () => {
    show({ ...leeProfilePageData, languages: [], helper: { ...leeProfilePageData.helper, rating: { average: 5, count: 1 } } });
    expect(screen.queryByRole('region', { name: 'Languages' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing the/)).not.toBeInTheDocument();
  });

  it('does not render private contact details or address fields supplied beyond the public contract', () => {
    const helper = { ...samProfilePageData.helper, lastName: 'PrivateSurname', email: 'private@example.test', phone: '+15125550134', address: '1234 Example Lane' };
    const { container } = show({ ...samProfilePageData, helper });
    expect(container).not.toHaveTextContent(/PrivateSurname|private@example\.test|15125550134|1234|Example Lane/);
    expect(container.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull();
  });
});
