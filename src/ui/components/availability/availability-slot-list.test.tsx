/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { jordanProfileWithSlotsData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { AvailabilitySlotList } from './availability-slot-list';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(cleanup);

describe('AvailabilitySlotList', () => {
  it('preserves slot order and links each opening to its helper and slot id', () => {
    const slots = jordanProfileWithSlotsData.slots!;
    render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><AvailabilitySlotList slots={slots} handle={jordanProfileWithSlotsData.helper.handle} /></TimeZoneProvider></NextIntlClientProvider>);
    const cards = within(screen.getByRole('region', { name: 'Open times' })).getAllByRole('listitem');
    expect(cards).toHaveLength(slots.length);
    slots.forEach((slot, index) => expect(within(cards[index]!).getByRole('link', { name: 'Request this time' })).toHaveAttribute('href', routes.app.requestHelper(jordanProfileWithSlotsData.helper.handle, { slotId: slot.id })));
    expect(cards[0]).toHaveTextContent('Sat, Dec 12 · 9:00 am–1:00 pm');
    expect(cards[0]).toHaveTextContent('Yard cleanup');
    expect(cards[0]).toHaveTextContent('$30.00/h · about 3 h, up to 4 h');
    expect(cards[1]).toHaveTextContent('Tue, Dec 15 · 5:00 pm–8:00 pm');
    expect(cards[1]).toHaveTextContent('$45.00');
  });
});
