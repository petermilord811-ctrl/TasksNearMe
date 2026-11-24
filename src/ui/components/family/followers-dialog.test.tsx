/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { FollowerHandlers } from '@/contracts';
import { deskThreadClientWithFollower, deskThreadFollowerView, deskThreadHelperWithFollower, followersPanelEmpty, followersPanelFull, followersPanelOne } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { FamilyNote } from './family-note';
import { FollowersDialog } from './followers-dialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const handlers = (overrides: Partial<FollowerHandlers> = {}): FollowerHandlers => ({
  onAdd: vi.fn().mockResolvedValue({ ok: true, code: 'saved' }),
  onRemove: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
  ...overrides,
});
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">{node}</NextIntlClientProvider>);

describe('FollowersDialog', () => {
  it('says what a follower sees and can\'t do, and adds by username or email', async () => {
    const given = handlers();
    wrap(<FollowersDialog open onOpenChange={() => {}} panel={followersPanelEmpty} handlers={given} helperName="Jordan" />);
    expect(screen.getByText(/never see your address or payments/)).toBeTruthy();
    expect(screen.getByText(/Jordan will see who follows/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Their username or email'), '@lia');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(given.onAdd).toHaveBeenCalledWith({ bookingId: 'bkg_desk', who: '@lia' }));
    expect(await screen.findByText(/Added @lia/)).toBeTruthy();
  });

  it('checks the field first, and says when there is no such account', async () => {
    const given = handlers({ onAdd: vi.fn().mockResolvedValue({ ok: false, code: 'not_found' }) });
    wrap(<FollowersDialog open onOpenChange={() => {}} panel={followersPanelEmpty} handlers={given} helperName="Jordan" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter a username/);
    expect(given.onAdd).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Their username or email'), 'someone@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't find a TasksNearMe account/);
  });

  it.each([['not_allowed', /can't follow this booking/], ['limit_reached', /2 people follow this booking already/], ['expired', /This booking is over/]] as const)('maps %s to its own words', async (code, text) => {
    wrap(<FollowersDialog open onOpenChange={() => {}} panel={followersPanelEmpty} handlers={handlers({ onAdd: vi.fn().mockResolvedValue({ ok: false, code }) })} helperName="Jordan" />);
    await userEvent.type(screen.getByLabelText('Their username or email'), 'lia');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(text);
  });

  it('removes a follower by their id', async () => {
    const given = handlers();
    wrap(<FollowersDialog open onOpenChange={() => {}} panel={followersPanelOne} handlers={given} helperName="Jordan" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Lia R.' }));
    await waitFor(() => expect(given.onRemove).toHaveBeenCalledWith({ bookingId: 'bkg_desk', followerId: 'usr_lia' }));
  });

  it('offers no field at the limit, and says why', () => {
    wrap(<FollowersDialog open onOpenChange={() => {}} panel={followersPanelFull} handlers={handlers()} helperName="Jordan" />);
    expect(screen.queryByLabelText('Their username or email')).toBeNull();
    expect(screen.getByText(/the most it can have/)).toBeTruthy();
  });
});

describe('FamilyNote', () => {
  it('tells the helper whose family follows, the client that they do, and the follower that it is read-only', () => {
    const { unmount } = wrap(<FamilyNote family={deskThreadHelperWithFollower.family} />);
    expect(screen.getByRole('note').textContent).toBe("Maya R.'s family member Lia R. follows this booking. They can read the conversation but can't write in it.");
    unmount();
    const client = wrap(<FamilyNote family={deskThreadClientWithFollower.family} />);
    expect(screen.getByRole('note').textContent).toMatch(/^Lia R\. follows this booking as your family/);
    client.unmount();
    wrap(<FamilyNote family={deskThreadFollowerView.family} />);
    expect(screen.getByRole('note').textContent).toBe("You're following Maya R.'s booking (read-only). Maya R.'s messages are on the right.");
  });
});
