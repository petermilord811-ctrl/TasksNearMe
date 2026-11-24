/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GifSearchInput, GifSearchResult, PhotoUploadResult, SendMessageInput, ThreadHandlers } from '@/contracts';
import { deskBookingThreadPageData, fakeHandler, fakeThreadHandlers, gifMessage, gifPanelStates, gifTrendingResults, sentGifPhoto } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import thread from '../../../../messages/en/ui/thread.json';
import { GifPickerPanel } from './gif-picker';
import { MessageComposer } from './message-composer';
import { MessageLog } from './message-log';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const messages = { ...uiMessages, thread };
const copy = thread.composer.gif;
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/app/messages/thr_desk' }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const wrap = (node: ReactNode) => <NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">{node}</TimeZoneProvider></NextIntlClientProvider>;
const trending = (): Promise<GifSearchResult> => Promise.resolve({ ok: true, results: gifTrendingResults });
const gifButtons = () => screen.getAllByRole('button', { name: /^Send GIF: / });

describe('GifPickerPanel', () => {
  it('shows trending as it opens, and moves between GIFs with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn<(input: GifSearchInput) => Promise<GifSearchResult>>(trending);
    const onPick = vi.fn();
    render(wrap(<GifPickerPanel onSearch={onSearch} onPick={onPick} />));
    await waitFor(() => expect(gifButtons()).toHaveLength(gifTrendingResults.length));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith({ q: '', page: 1 });
    expect(screen.getByText(copy.trending)).toBeInTheDocument();
    expect(screen.getByText(copy.attribution)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: copy.search })).toHaveAttribute('placeholder', 'Search KLIPY');
    // One tab stop for the whole grid.
    expect(gifButtons().filter((button) => button.tabIndex === 0)).toHaveLength(1);

    await user.click(screen.getByRole('searchbox', { name: copy.search }));
    await user.keyboard('{ArrowDown}');
    expect(gifButtons()[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(gifButtons()[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(gifButtons()[4]).toHaveFocus();
    await user.keyboard('{End}');
    expect(gifButtons()[gifTrendingResults.length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(gifButtons()[0]).toHaveFocus();
    expect(gifButtons()[0]!.tabIndex).toBe(0);
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('searchbox', { name: copy.search })).toHaveFocus();

    await user.keyboard('{ArrowDown}{ArrowRight}{Enter}');
    expect(onPick).toHaveBeenCalledExactlyOnceWith(gifTrendingResults[1]);
  });

  it('searches as you type, says when nothing matches, and offers Try again after a failure', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn<(input: GifSearchInput) => Promise<GifSearchResult>>(async ({ q }) => (q === 'zebra' ? { ok: true, results: [] } : q === 'boom' ? { ok: false, code: 'unavailable' } : { ok: true, results: gifTrendingResults }));
    render(wrap(<GifPickerPanel onSearch={onSearch} onPick={vi.fn()} />));
    await waitFor(() => expect(gifButtons()).toHaveLength(gifTrendingResults.length));
    await user.type(screen.getByRole('searchbox', { name: copy.search }), 'zebra');
    expect((await screen.findAllByText('No GIFs for “zebra”. Try other words.', undefined, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(onSearch).toHaveBeenLastCalledWith({ q: 'zebra', page: 1 });
    await user.clear(screen.getByRole('searchbox', { name: copy.search }));
    await user.type(screen.getByRole('searchbox', { name: copy.search }), 'boom{Enter}');
    expect(await screen.findByRole('button', { name: copy.retry })).toBeInTheDocument();
    expect(screen.getAllByText(copy.error).length).toBeGreaterThan(0);
  });

  it('loads more, keeping what it has', async () => {
    const user = userEvent.setup();
    const [first, ...rest] = gifTrendingResults;
    const onSearch = vi.fn<(input: GifSearchInput) => Promise<GifSearchResult>>(async ({ page }) => (page === 1 ? { ok: true, results: [first!], nextPage: 2 } : { ok: true, results: rest }));
    render(wrap(<GifPickerPanel onSearch={onSearch} onPick={vi.fn()} />));
    await user.click(await screen.findByRole('button', { name: copy.more }));
    await waitFor(() => expect(gifButtons()).toHaveLength(gifTrendingResults.length));
    expect(onSearch).toHaveBeenLastCalledWith({ q: '', page: 2 });
    expect(screen.queryByRole('button', { name: copy.more })).not.toBeInTheDocument();
  });
});

describe('GifPickerPanel states (the previews)', () => {
  it.each(Object.entries(gifPanelStates))('shows the %s state without asking for anything', (_name, seed) => {
    const onSearch = vi.fn(trending);
    render(wrap(<GifPickerPanel seed={seed} onSearch={onSearch} onPick={vi.fn()} />));
    expect(screen.getByText(copy.attribution)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Send GIF: / })).toHaveLength(seed.status === 'ready' ? seed.results.length : 0);
    expect(screen.queryByRole('button', { name: copy.more }) !== null).toBe(seed.status === 'ready' && Boolean(seed.nextPage));
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe('MessageComposer with GIFs', () => {
  function mount(onAttachGif: ThreadHandlers['onAttachGif']) {
    const handlers: ThreadHandlers = {
      ...fakeThreadHandlers,
      onSend: vi.fn(fakeHandler<SendMessageInput>({ ok: true, code: 'sent' }, 0)),
      onSearchGifs: vi.fn(trending),
      onAttachGif,
    };
    render(wrap(<MessageComposer rules={deskBookingThreadPageData.composer} handlers={handlers} />));
    return handlers;
  }

  it('sends a picked GIF at once, by its id, as its own message', async () => {
    const user = userEvent.setup();
    const attach = vi.fn(async (): Promise<PhotoUploadResult> => ({ ok: true, photo: sentGifPhoto }));
    const handlers = mount(attach);
    await user.type(screen.getByRole('textbox', { name: thread.composer.label }), 'Still writing');
    await user.click(screen.getByRole('button', { name: copy.open }));
    await waitFor(() => expect(gifButtons()).toHaveLength(gifTrendingResults.length));
    await user.click(screen.getByRole('button', { name: `Send GIF: ${gifTrendingResults[4]!.title}` }));
    await waitFor(() => expect(handlers.onSend).toHaveBeenCalledOnce());
    expect(attach).toHaveBeenCalledExactlyOnceWith({ id: gifTrendingResults[4]!.id });
    expect(handlers.onSend).toHaveBeenCalledWith({ body: '', attachmentIds: [sentGifPhoto.id], requestKey: expect.any(String) });
    // The picker closed; what was written stays for its own message.
    await waitFor(() => expect(screen.queryByRole('searchbox', { name: copy.search })).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: thread.composer.label })).toHaveValue('Still writing');
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('says why a GIF could not be sent, and sends nothing', async () => {
    const user = userEvent.setup();
    const handlers = mount(vi.fn(async (): Promise<PhotoUploadResult> => ({ ok: false, code: 'too_large' })));
    await user.click(screen.getByRole('button', { name: copy.open }));
    await user.click((await screen.findAllByRole('button', { name: /^Send GIF: / }))[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.failed.too_large);
    expect(handlers.onSend).not.toHaveBeenCalled();
  });
});

describe('MessageLog with a GIF', () => {
  it('shows the GIF itself, with no View photo, and a Play GIF still that plays on a tap', async () => {
    const user = userEvent.setup();
    render(wrap(<MessageLog messages={[gifMessage]} otherParty={deskBookingThreadPageData.thread.otherParty} now="2026-11-21T16:05:00.000Z" />));
    const image = screen.getByRole('img', { name: sentGifPhoto.alt });
    expect(image.getAttribute('src')).toContain('thank-you.gif');
    expect(screen.queryByText(thread.viewPhoto)).not.toBeInTheDocument();
    // Reduced motion (a CSS media query): the GIF hides and the still placeholder shows, until Play is tapped.
    const opener = screen.getByRole('button', { name: `View GIF larger: ${sentGifPhoto.alt}` });
    const play = screen.getByRole('button', { name: `Play GIF: ${sentGifPhoto.alt}` });
    expect(opener).toHaveClass('motion-reduce:hidden');
    expect(play).toHaveClass('hidden', 'motion-reduce:flex');
    expect(play).toHaveTextContent(thread.gif.play);
    await user.click(play);
    expect(screen.queryByRole('button', { name: `Play GIF: ${sentGifPhoto.alt}` })).not.toBeInTheDocument();
    expect(opener).not.toHaveClass('motion-reduce:hidden');
  });
});
