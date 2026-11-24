/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { NeighborGroupHandlers } from '@/contracts';
import { routes } from '@/contracts/routes';
import {
  fakeNeighborGroupHandlers,
  GROUPS_NOW,
  groupViewAdmin,
  groupViewReadOnly,
  groupViewStates,
  inviteWrongArea,
  neighborGroupsLimit,
  neighborGroupsNoArea,
  neighborGroupsUnread,
  neighborGroupsWithInvite,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { NeighborGroupPanel } from '../community/neighbor-group-sheet';
import { NeighborGroupsCard } from './neighbor-groups-card';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => '/app/community' }));

afterEach(cleanup);
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">{node}</NextIntlClientProvider>);

/** Building and street groups on Neighbors (2026-11-24). */
describe('NeighborGroupsCard', () => {
  it('lists the viewer’s groups with what is unread, and opens one over the page', async () => {
    const handlers = fakeNeighborGroupHandlers();
    const onOpen = vi.spyOn(handlers, 'onOpen');
    wrap(<NeighborGroupsCard data={neighborGroupsUnread} handlers={handlers} now={GROUPS_NOW} />);
    expect(screen.getByRole('heading', { name: 'Your groups' })).toBeDefined();
    const aldrich = screen.getByRole('button', { name: 'Open Aldrich St 1900 block, 3 unread messages' });
    expect(screen.getByRole('button', { name: 'Open Garden Court building, 12 unread messages' })).toBeDefined();
    expect(screen.getByLabelText('Muted')).toBeDefined();
    fireEvent.click(aldrich);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ groupId: 'ngrp_aldrich' }));
    expect(await screen.findByRole('heading', { name: 'Aldrich St 1900 block' })).toBeDefined();
  });

  it('says why creating is off: no neighborhood yet, or 3 created', () => {
    wrap(<NeighborGroupsCard data={neighborGroupsNoArea} handlers={fakeNeighborGroupHandlers()} now={GROUPS_NOW} />);
    expect(screen.getByText('Choose your neighborhood to start or join a group there.')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Create a group' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    wrap(<NeighborGroupsCard data={neighborGroupsLimit} handlers={fakeNeighborGroupHandlers()} now={GROUPS_NOW} />);
    expect(screen.getByText("You've created 3 groups, the most one person can.")).toBeDefined();
  });

  it('opens an invite from its link, and joins only once the person accepts', async () => {
    const handlers = fakeNeighborGroupHandlers();
    const onJoin = vi.spyOn(handlers, 'onJoin');
    wrap(<NeighborGroupsCard data={neighborGroupsWithInvite} handlers={handlers} now={GROUPS_NOW} />);
    const dialog = await screen.findByRole('dialog', { name: 'Join a group' });
    expect(within(dialog).getByText("You're invited to Aldrich St 1900 block.")).toBeDefined();
    expect(within(dialog).getByText(/Never your address, phone number or email/)).toBeDefined();
    expect(onJoin).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join group' }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({ code: 'K7QM-3XPD' }));
  });

  it('says why an invite from another neighborhood can’t be used', async () => {
    wrap(<NeighborGroupsCard data={{ ...neighborGroupsUnread, invite: inviteWrongArea }} handlers={fakeNeighborGroupHandlers()} now={GROUPS_NOW} />);
    const dialog = await screen.findByRole('dialog', { name: 'Join a group' });
    expect(within(dialog).getByText('Cherrywood Ave neighbors is for neighbors in Cherrywood. You can join groups in your own neighborhood (Mueller).')).toBeDefined();
    expect((within(dialog).getByRole('button', { name: 'Join group' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('NeighborGroupPanel', () => {
  const panel = (view = groupViewAdmin, handlers: NeighborGroupHandlers = fakeNeighborGroupHandlers(), onReload = vi.fn()) =>
    wrap(<NeighborGroupPanel view={view} handlers={handlers} onReload={onReload} onClose={vi.fn()} />);

  it('shows masked messages, newest last, with report links for others’ and delete for your own', () => {
    panel();
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('Package room is open again');
    expect(items[items.length - 1]!.textContent).toContain('Chris D.');
    // The phone shows only as masked, with its last 4 digits.
    expect(items[1]!.textContent).toContain('0147');
    expect(items[1]!.textContent).not.toMatch(/512/);
    expect(screen.getByRole('link', { name: 'Report this message from Ben W.' }).getAttribute('href')).toBe(routes.app.report('group_message', 'ngmsg_2'));
    expect(screen.getAllByRole('button', { name: 'Delete your message' })).toHaveLength(1);
  });

  it('marks what was reported, removed, deleted or hidden by a block', () => {
    panel(groupViewStates);
    expect(screen.getByText('Removed by our team')).toBeDefined();
    expect(screen.getByText('Message deleted')).toBeDefined();
    expect(screen.getByText('You reported this')).toBeDefined();
    expect(screen.getByText('2 messages are hidden because of a block.')).toBeDefined();
    expect(screen.getByText("Older messages aren't shown here.")).toBeDefined();
  });

  it('sends a message and clears the box; says when it was too many', async () => {
    const handlers = fakeNeighborGroupHandlers();
    const onSend = vi.spyOn(handlers, 'onSend');
    const onReload = vi.fn();
    panel(groupViewAdmin, handlers, onReload);
    const box = screen.getByLabelText('Message to Mueller Lofts residents');
    fireEvent.change(box, { target: { value: 'Who has a ladder?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(onSend).toHaveBeenCalledWith({ groupId: 'ngrp_lofts', body: 'Who has a ladder?' });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
    expect(onReload).toHaveBeenCalled();
    onSend.mockResolvedValueOnce({ ok: false, code: 'rate_limited', retryAt: '2026-11-17T15:01:00.000Z' });
    fireEvent.change(box, { target: { value: 'Again' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('Again'));
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('has no composer for an account that can’t write', () => {
    panel(groupViewReadOnly);
    expect(screen.getByText("Your account can't send messages right now.")).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('mutes the group from its bell', async () => {
    const handlers = fakeNeighborGroupHandlers();
    const onMute = vi.spyOn(handlers, 'onMute');
    panel(groupViewAdmin, handlers);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mute notifications' })));
    expect(onMute).toHaveBeenCalledWith({ groupId: 'ngrp_lofts', muted: true });
  });
});
