/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESK_TIMES, deskExactAddress, muellerAreaForJordan, remoteLocation } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import location from '../../../../messages/en/ui/location.json';
import { ExactAddressPanel } from './exact-address-panel';
import { GeneralArea } from './general-area';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderLocation(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ...uiMessages, location }}><TimeZoneProvider timeZone="America/Chicago">
      {children}
    </TimeZoneProvider></NextIntlClientProvider>,
  );
}

describe('GeneralArea', () => {
  it('shows the general area and distance band with an accessible map and no exact address', () => {
    const { container } = renderLocation(<GeneralArea location={muellerAreaForJordan} showMap />);
    expect(screen.getByText('Mueller, Austin')).toBeVisible();
    expect(screen.getByText('About 2 miles away')).toBeVisible();
    expect(screen.getByRole('region', { name: /General area around Mueller, Austin/ })).toBeVisible();
    expect(container).not.toHaveTextContent(deskExactAddress.line1);
    expect(container.innerHTML).not.toContain('30.2993');
  });

  it('renders the remote variant without a location map', () => {
    renderLocation(<GeneralArea location={remoteLocation} showMap />);
    expect(screen.getByText('Remote — no address needed')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('ExactAddressPanel', () => {
  it('copies only the address, exposes pending state, and announces success', async () => {
    const user = userEvent.setup();
    let completeCopy: () => void = () => undefined;
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>((resolve) => { completeCopy = resolve; }));
    renderLocation(<ExactAddressPanel address={deskExactAddress} visibleUntil={DESK_TIMES.addressHidden} />);
    await user.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(screen.getByRole('button', { name: 'Copying address' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copying address' })).toHaveAttribute('aria-busy', 'true');
    expect(writeText).toHaveBeenCalledWith('1234 Example Lane\nApt 2B\nAustin, TX 78723');
    await act(async () => completeCopy());
    expect(screen.getByRole('status')).toHaveTextContent('Address copied.');
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeEnabled();
    expect(screen.getByText('Visible to you until Mon, Nov 23 · 1:05 pm')).toBeVisible();
  });

  it('announces clipboard failure with a manual alternative', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard permission denied'));
    renderLocation(<ExactAddressPanel address={deskExactAddress} />);
    await user.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(screen.getByRole('status')).toHaveTextContent("The address couldn't be copied. Select the address and copy it manually.");
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeEnabled();
  });

  it('does not fabricate a maps destination when the app has not supplied one', () => {
    renderLocation(<ExactAddressPanel address={deskExactAddress} />);
    expect(screen.getByRole('button', { name: 'Open in maps' })).toBeDisabled();
    expect(screen.getByText('Copy the address to open it in your map app.')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers directions in the map apps the app supplies, from one menu beside Copy (audit L32)', async () => {
    const user = userEvent.setup();
    renderLocation(<ExactAddressPanel address={deskExactAddress} mapsHref="https://maps.example/search" directions={{ google: 'https://maps.example/google', apple: 'https://maps.example/apple' }} />);
    expect(screen.queryByRole('link', { name: /Directions in Google Maps/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: location.directions }));
    expect(screen.getByRole('menuitem', { name: /Directions in Google Maps/ })).toHaveAttribute('href', 'https://maps.example/google');
    expect(screen.getByRole('menuitem', { name: /Directions in Apple Maps/ })).toHaveAttribute('href', 'https://maps.example/apple');
    expect(screen.getByRole('menuitem', { name: /Open in maps/ })).toHaveAttribute('href', 'https://maps.example/search');
  });
});

describe('ExactAddressPanel headings (accessibility pass, J-A3)', () => {
  it('takes the level of where it sits, the access notes one below', () => {
    const address = { ...deskExactAddress, accessNotes: 'Side gate is unlocked.' };
    renderLocation(<ExactAddressPanel address={address} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: location.exactAddress })).toBeVisible();
    expect(screen.getByRole('heading', { level: 4, name: location.accessNotes })).toBeVisible();
    cleanup();
    renderLocation(<ExactAddressPanel address={address} />);
    expect(screen.getByRole('heading', { level: 2, name: location.exactAddress })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: location.accessNotes })).toBeVisible();
  });
});
