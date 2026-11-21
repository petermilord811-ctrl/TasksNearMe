/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_FIELDS, type AdminConfigHandlers } from '@/contracts';
import { ADMIN_NOW, adminConfigData, adminConfigNoMarketsData, adminConfigPausedData, adminConfigSearchElsewhereData, adminConfigSearchOpenData, adminConfigStaleMarketsData, adminMarketsReadOnlyData, fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminConfig.json';
import { AdminConfigScreen, AdminMarketsScreen } from './admin-config-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(data = adminConfigData) {
  const handlers = {
    onPublishPolicy: vi.fn<AdminConfigHandlers['onPublishPolicy']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onSetFlag: vi.fn<AdminConfigHandlers['onSetFlag']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onSetOutage: vi.fn<AdminConfigHandlers['onSetOutage']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onSetMarketStatus: vi.fn<AdminConfigHandlers['onSetMarketStatus']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onSetSearchIndexing: vi.fn<AdminConfigHandlers['onSetSearchIndexing']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
  };
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminConfigScreen data={data} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
  return handlers;
}

describe('AdminConfigScreen', () => {
  it('pauses bookings behind a reason dialog (the outage switch)', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const section = within(screen.getByRole('region', { name: copy.outage.title }));
    expect(section.getByText(copy.outage.open)).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: copy.outage.pause }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Pause new bookings in Austin?' }));
    await user.type(dialog.getByLabelText('Reason'), 'Card charges are failing for everyone.');
    await user.click(dialog.getByRole('button', { name: copy.outage.pause }));
    await waitFor(() => expect(handlers.onSetOutage).toHaveBeenCalledWith({ state: 'paused', reason: 'Card charges are failing for everyone.' }));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('shows who paused bookings and why, and offers to reopen', async () => {
    const user = userEvent.setup();
    const handlers = mount(adminConfigPausedData);
    const section = within(screen.getByRole('region', { name: copy.outage.title }));
    expect(section.getByText(copy.outage.paused)).toBeInTheDocument();
    expect(section.getByText(/^Paused .* by Riley N\.$/)).toBeInTheDocument();
    expect(section.getByText(`Reason: ${adminConfigPausedData.outage.changed!.reason}`)).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: copy.outage.resume }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Reopen bookings in Austin?' }));
    await user.type(dialog.getByLabelText('Reason'), 'Stripe confirmed the fix.');
    await user.click(dialog.getByRole('button', { name: copy.outage.resume }));
    await waitFor(() => expect(handlers.onSetOutage).toHaveBeenCalledWith({ state: 'open', reason: 'Stripe confirmed the fix.' }));
  });

  it('opens task pages and helper profiles to search behind a reason dialog (launch day, no deploy)', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const section = within(screen.getByRole('region', { name: copy.search.title }));
    expect(section.getByText(copy.search.site)).toBeInTheDocument();
    expect(section.getByText(copy.search.default)).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: copy.search.open }));
    const dialog = within(await screen.findByRole('alertdialog', { name: copy.search.openTitle }));
    await user.type(dialog.getByLabelText('Reason'), 'Gainesville launch: listings are real and moderated.');
    await user.click(dialog.getByRole('button', { name: copy.search.open }));
    await waitFor(() => expect(handlers.onSetSearchIndexing).toHaveBeenCalledWith({ setting: 'on', reason: 'Gainesville launch: listings are real and moderated.' }));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('shows who opened the listings and why, and offers to keep them out again', async () => {
    const user = userEvent.setup();
    const handlers = mount(adminConfigSearchOpenData);
    const section = within(screen.getByRole('region', { name: copy.search.title }));
    expect(section.getByText(copy.search.on)).toBeInTheDocument();
    expect(section.getByText(/^Changed .* by Riley N\.$/)).toBeInTheDocument();
    expect(section.getByText(`Reason: ${adminConfigSearchOpenData.searchIndexing.lastChange!.reason}`)).toBeInTheDocument();
    expect(section.queryByText(copy.search.elsewhere)).not.toBeInTheDocument();
    await user.click(section.getByRole('button', { name: copy.search.close }));
    const dialog = within(await screen.findByRole('alertdialog', { name: copy.search.closeTitle }));
    await user.type(dialog.getByLabelText('Reason'), 'A report showed an unmoderated task in search.');
    await user.click(dialog.getByRole('button', { name: copy.search.close }));
    await waitFor(() => expect(handlers.onSetSearchIndexing).toHaveBeenCalledWith({ setting: 'site', reason: 'A report showed an unmoderated task in search.' }));
  });

  it('says when this copy of the app stays out of search whatever the setting says', () => {
    mount(adminConfigSearchElsewhereData);
    expect(within(screen.getByRole('region', { name: copy.search.title })).getByText(copy.search.elsewhere)).toBeInTheDocument();
  });

  it('has a label for every policy field', () => {
    for (const key of POLICY_FIELDS) expect(copy.fields[key]).toMatch(/\S/);
  });

  it('fills the form with the version in use, in percent and dollars, and publishes in basis points and cents', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const form = within(screen.getByRole('form', { name: copy.publishTitle }));
    expect(form.getByLabelText(copy.fields.posterBps)).toHaveValue('10');
    expect(form.getByLabelText(copy.fields.posterMinCents)).toHaveValue('3.00');
    await user.clear(form.getByLabelText(copy.fields.posterBps));
    await user.type(form.getByLabelText(copy.fields.posterBps), '12.5');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    expect(await form.findByText(copy.reasonRequired)).toBeInTheDocument();
    expect(handlers.onPublishPolicy).not.toHaveBeenCalled();
    await user.type(form.getByLabelText(copy.reason), 'A small fee change for the holidays.');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    await waitFor(() => expect(handlers.onPublishPolicy).toHaveBeenCalledWith(expect.objectContaining({ posterBps: 1250, posterMinCents: 300, helperBps: 1000, autoApproveHours: 72, reason: 'A small fee change for the holidays.' })));
    expect(await form.findByText(copy.published)).toBeInTheDocument();
  });

  it('explains the allowed range for a value out of range, before sending', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const form = within(screen.getByRole('form', { name: copy.publishTitle }));
    await user.clear(form.getByLabelText(copy.fields.posterBps));
    await user.type(form.getByLabelText(copy.fields.posterBps), '45');
    await user.type(form.getByLabelText(copy.reason), 'Trying a much higher fee.');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    expect(await form.findByText('From 0% to 30%.')).toBeInTheDocument();
    expect(handlers.onPublishPolicy).not.toHaveBeenCalled();
  });

  it('turns a flag off after a confirmation with a reason', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    await user.click(screen.getByRole('button', { name: 'Turn off ai_drafting' }));
    const dialog = within(screen.getByRole('alertdialog'));
    await user.type(dialog.getByLabelText(copy.reason), 'Pausing while we review its suggestions.');
    await user.click(dialog.getByRole('button', { name: 'Turn off ai_drafting' }));
    await waitFor(() => expect(handlers.onSetFlag).toHaveBeenCalledWith({ key: 'ai_drafting', enabled: false, reason: 'Pausing while we review its suggestions.' }));
    expect(await screen.findByText(copy.flagSaved)).toBeInTheDocument();
  });
});

describe('the Markets section (plan 8.2)', () => {
  const markets = copy.markets;
  const card = (name: string) => within(screen.getByRole('listitem', { name }));

  it('lists each market with its status, ZIP prefixes, time zone, waiting helpers and waitlist', () => {
    mount();
    const section = within(screen.getByRole('region', { name: markets.title }));
    expect(section.getAllByRole('listitem')).toHaveLength(4);
    const austin = card('Austin, TX');
    expect(austin.getByText(markets.statuses.prelaunch)).toBeInTheDocument();
    expect(austin.getByText('786, 787')).toBeInTheDocument();
    expect(austin.getByText('America/Chicago')).toBeInTheDocument();
    expect(austin.getByText('4 helpers')).toBeInTheDocument();
    expect(austin.getByText('61 people')).toBeInTheDocument();
    expect(austin.getByText("Goes to 58 people when it's live")).toBeInTheDocument();
    expect(austin.getByText(/^Pre-launch since .* by Riley N\.$/)).toBeInTheDocument();
    expect(card('Tulsa, OK').getByText('Sent to 96, 31 still going out')).toBeInTheDocument();
    // Sends that failed for good say so, and where to turn (launch rehearsal J-L5); the others say nothing.
    expect(card('Tulsa, OK').getByText(/^3 couldn't be sent: the email provider refused them after every retry\./)).toBeInTheDocument();
    expect(austin.queryByText(/couldn't be sent/)).not.toBeInTheDocument();
  });

  it('shows the time-zone refusal and offers the opening buttons disabled', () => {
    mount();
    const laredo = card('Laredo, TX');
    expect(laredo.getByText("Laredo can't open yet: dates and times can't be shown in its time zone (America/Mexico_City) yet. Pausing works.")).toBeInTheDocument();
    expect(laredo.getByRole('button', { name: 'Take Laredo live' })).toBeDisabled();
    expect(laredo.getByRole('button', { name: 'Move Laredo to pre-launch' })).toBeDisabled();
    expect(card('Gainesville, FL').getByRole('button', { name: 'Take Gainesville live' })).toBeEnabled();
  });

  it('takes a market live behind a confirm step with a reason, saying who hears about it', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    await user.click(card('Austin, TX').getByRole('button', { name: 'Take Austin live' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Take Austin live?' }));
    expect(dialog.getByText("Austin opens to everyone. 58 people on its waitlist get one email that it's open, in their language. 12 people with an account there get one message that it's live: by email (unless they turned those off), in the bell and by push.")).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Take Austin live' }));
    expect(await dialog.findByText('Write why, in at least 10 characters.')).toBeInTheDocument();
    expect(handlers.onSetMarketStatus).not.toHaveBeenCalled();
    await user.type(dialog.getByLabelText('Reason'), 'Austin meets the supply and quality criteria.');
    await user.click(dialog.getByRole('button', { name: 'Take Austin live' }));
    await waitFor(() => expect(handlers.onSetMarketStatus).toHaveBeenCalledWith({ marketId: 'mkt_austin', status: 'live', reason: 'Austin meets the supply and quality criteria.' }));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('says what opening a paused market does, and cancels without calling anything', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    await user.click(card('Gainesville, FL').getByRole('button', { name: 'Move Gainesville to pre-launch' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Move Gainesville to pre-launch?' }));
    expect(dialog.getByText('Gainesville opens to helpers first. Its waitlist is emailed only once it goes live. 23 helpers waiting there come in and are told to choose a neighborhood.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(handlers.onSetMarketStatus).not.toHaveBeenCalled();
  });

  it('warns that pausing the home page’s city takes the home page down, and says how to roll back instead (launch rehearsal J-L1)', async () => {
    const user = userEvent.setup();
    mount({ ...adminConfigData, markets: adminConfigData.markets.map((market) => (market.id === 'mkt_tulsa' ? { ...market, homePage: true } : market)) });
    await user.click(card('Tulsa, OK').getByRole('button', { name: 'Pause Tulsa' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Pause Tulsa?' }));
    expect(dialog.getByText(/Tulsa is the home page's city: while it's paused, the home page answers "not found" too, and the pricing, become-a-helper and waitlist pages fail\. To roll back a launch, move it to pre-launch instead/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await user.click(card('Austin, TX').getByRole('button', { name: 'Pause Austin' }));
    expect(within(await screen.findByRole('alertdialog', { name: 'Pause Austin?' })).queryByText(/home page's city/)).not.toBeInTheDocument();
  });

  it('shows the server’s time-zone refusal in the confirm step', async () => {
    const user = userEvent.setup();
    const handlers = mount(adminConfigStaleMarketsData);
    handlers.onSetMarketStatus.mockResolvedValue({ ok: false, code: 'validation_failed', fieldErrors: { timeZone: ['not_supported'] } });
    await user.click(card('Laredo, TX').getByRole('button', { name: 'Take Laredo live' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Take Laredo live?' }));
    await user.type(dialog.getByLabelText('Reason'), 'Opening Laredo for the season.');
    await user.click(dialog.getByRole('button', { name: 'Take Laredo live' }));
    expect(await dialog.findByText("Laredo can't open yet: dates and times can't be shown in its time zone (America/Mexico_City) yet. Pausing works.")).toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('says when there are no markets', () => {
    mount(adminConfigNoMarketsData);
    expect(within(screen.getByRole('region', { name: markets.title })).getByText(markets.empty)).toBeInTheDocument();
  });

  it('is read-only for staff who aren’t admins, with nothing else of config', () => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminMarketsScreen data={adminMarketsReadOnlyData} /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(markets.readOnly)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: copy.policyTitle })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: copy.outage.title })).not.toBeInTheDocument();
  });
});
