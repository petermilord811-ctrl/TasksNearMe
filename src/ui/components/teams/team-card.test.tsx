/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { TEAM_ACTION_IDS, TEAM_STATUSES, routes, type ActionResult, type TeamActionInput, type TeamInviteInput } from '@/contracts';
import { movingClientCancelChoiceData, movingLeadCanInviteData, movingPartnerBookingData, teamBarClient, teamCardStates } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { TeamBarView, TeamInviteCardView } from './team-card';
import { TeamPanel } from './team-panel';

/** Team up, 2026-11-24: the invite card for each of the three people, the team bar, and the booking page's panel. */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push, replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/app/messages', useSearchParams: () => new URLSearchParams() }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  push.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);
const ok = (code: 'updated' | 'sent' = 'updated'): Promise<ActionResult> => Promise.resolve({ ok: true, code });

describe('copy', () => {
  it('words every status and action in English and Spanish', () => {
    for (const catalog of [messages, esMessages]) {
      for (const status of TEAM_STATUSES) {
        expect(catalog.teams.card.status).toHaveProperty(status);
        expect(catalog.teams.card.statusClient).toHaveProperty(status);
      }
      for (const action of TEAM_ACTION_IDS) {
        expect(catalog.teams.card.actions).toHaveProperty(action);
        expect(catalog.teams.card.done).toHaveProperty(action);
      }
      expect(catalog.timeline).toHaveProperty('team_invited');
      expect(catalog.timeline).toHaveProperty('team_proposed');
    }
  });
});

describe('the invite card', () => {
  it('the partner accepts with their part and the note', async () => {
    const onAction = vi.fn((_input: TeamActionInput) => ok());
    wrap(<TeamInviteCardView card={teamCardStates.partnerInvited} handlers={{ onAction }} />);
    const card = screen.getByRole('article', { name: 'Team up' });
    expect(within(card).getByText('Jordan wants you on their team for this job')).toBeTruthy();
    expect(within(card).getByText(/^\$120(\.00)? for your part$/)).toBeTruthy();
    expect(within(card).getByText(/Bring gloves and a dolly/)).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: 'Accept' }));
    expect(onAction).toHaveBeenCalledWith({ teamId: 'tem_moving', action: 'accept' });
  });

  it("the client confirms the partner's part, which opens the confirm dialog", async () => {
    const onAction = vi.fn(() => Promise.resolve<ActionResult>({ ok: true, code: 'opened', redirectTo: routes.app.confirmOffer('tsk_part', 'off_part') }));
    wrap(<TeamInviteCardView card={teamCardStates.clientAccepted} handlers={{ onAction }} />);
    expect(screen.getByText(/^Jordan wants to bring Sam: \$120(\.00)? for Sam's part$/)).toBeTruthy();
    expect(screen.queryByText(/Bring gloves/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Sam' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/tasks/tsk_part/offers/off_part/confirm', { scroll: false }));
  });

  it("the lead sees no price once confirmed, and no buttons without handlers", () => {
    wrap(<TeamInviteCardView card={teamCardStates.leadConfirmed} />);
    expect(screen.queryByText(/\$120/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('On the team')).toBeTruthy();
  });

  it('says when the invite expired meanwhile', async () => {
    wrap(<TeamInviteCardView card={teamCardStates.partnerInvited} handlers={{ onAction: () => Promise.resolve({ ok: false, code: 'expired' }) }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired/);
  });
});

describe('the team bar', () => {
  it('names the team and links the other conversation in place', () => {
    wrap(<TeamBarView bar={teamBarClient} />);
    const bar = screen.getByRole('navigation', { name: 'Team: Jordan (lead) and Sam' });
    expect(within(bar).getByText('With Jordan').getAttribute('aria-current')).toBe('page');
    expect(within(bar).getByRole('link', { name: 'With Sam' }).getAttribute('href')).toBe(routes.app.thread('thr_bkg_moving_sam'));
  });

  it('in the chat window, opens the other conversation there, not as a page (sweep C9)', async () => {
    const onOpen = vi.fn();
    wrap(<TeamBarView bar={teamBarClient} compact onOpen={onOpen} />);
    const bar = screen.getByRole('navigation', { name: 'Team: Jordan (lead) and Sam' });
    expect(within(bar).queryByRole('link')).toBeNull();
    await userEvent.click(within(bar).getByRole('button', { name: 'With Sam' }));
    expect(onOpen).toHaveBeenCalledWith('thr_bkg_moving_sam');
  });
});

describe('the booking page panel', () => {
  it('the lead invites by @username with a price', async () => {
    const onInvite = vi.fn((_input: TeamInviteInput) => ok('sent'));
    wrap(<TeamPanel data={movingLeadCanInviteData} team={movingLeadCanInviteData.team!} handlers={{ onInvite, onAction: () => ok() }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Team up' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Their @username'), '@sam');
    await userEvent.type(within(dialog).getByLabelText('Task price ($)'), '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(onInvite.mock.calls[0]![0]).toMatchObject({ username: '@sam', pricing: { type: 'fixed', priceCents: 12000 } });
  });

  it('shows the server refusing the @username on the field', async () => {
    wrap(<TeamPanel data={movingLeadCanInviteData} team={movingLeadCanInviteData.team!} handlers={{ onInvite: () => Promise.resolve({ ok: false, code: 'validation_failed', fieldErrors: { username: ['invalid'] } }), onAction: () => ok() }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Team up' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Their @username'), 'nobody');
    await userEvent.type(within(dialog).getByLabelText('Task price ($)'), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(await within(dialog).findByText('No helper with that @username can take this job.')).toBeTruthy();
  });

  it('the client keeps the partner after the lead canceled', async () => {
    const onKeep = vi.fn(() => ok());
    wrap(<TeamPanel data={movingClientCancelChoiceData} team={movingClientCancelChoiceData.team!} handlers={{ onAction: () => ok(), onKeep }} partnerSheets={{ onPreviewCancel: () => new Promise(() => undefined), onCancel: () => ok(), onRunningLate: () => ok(), onReportNoShow: () => ok(), onCantAccess: () => ok(), onSafetyReport: () => ok() }} />);
    expect(screen.getByText("Sam's booking is still on")).toBeTruthy();
    expect(screen.getByRole('button', { name: "Cancel Sam's booking" })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Keep Sam' }));
    expect(onKeep).toHaveBeenCalledWith({ teamId: 'tem_moving' });
    await waitFor(() => expect(screen.queryByText("Sam's booking is still on")).toBeNull());
  });

  it("the partner's booking says who leads it", () => {
    wrap(<TeamPanel data={movingPartnerBookingData} team={movingPartnerBookingData.team!} />);
    expect(screen.getByText("Jordan T. leads this job. You're the second helper.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Team chat' }).getAttribute('href')).toBe(routes.app.thread('thr_team_moving'));
  });
});
