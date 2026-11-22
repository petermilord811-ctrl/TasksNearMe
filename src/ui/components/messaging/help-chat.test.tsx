/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HelpChatHandlers } from '@/contracts';
import { routes } from '@/contracts/routes';
import {
  answeredTranscript,
  emptyTranscript,
  failedTranscript,
  fakeHelpChatHandlers,
  helpChatAssistantData,
  helpChatCaseRepliedData,
  helpChatCaseWaitingData,
  helpChatRecentData,
  helpChatUnavailableData,
  pendingTranscript,
  suggestTranscript,
  urgentTranscript,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { HelpChat } from './help-chat';

afterEach(cleanup);
const now = '2026-11-17T16:00:00.000Z';
const wrap = (node: React.ReactNode, locale: 'en' | 'es' = 'en') => render(<NextIntlClientProvider locale={locale} timeZone="America/Chicago" messages={locale === 'en' ? messages : esMessages}>{node}</NextIntlClientProvider>);
const handlers = (overrides: Partial<HelpChatHandlers> = {}): HelpChatHandlers => ({ ...fakeHelpChatHandlers, ...overrides });

describe('HelpChat', () => {
  it('greets by first name, says it is an AI, and offers popular questions for the mode', () => {
    const onAsk = vi.fn();
    wrap(<HelpChat data={helpChatAssistantData} transcript={emptyTranscript} handlers={handlers({ onAsk })} now={now} />);
    expect(screen.getByText(/Hi Maya, I'm the TasksNearMe assistant, an AI/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'When am I charged?' }));
    expect(onAsk).toHaveBeenCalledWith('When am I charged?');
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeDefined();
  });

  it('shows an answer with the help articles it used, and sends a typed question', () => {
    const onAsk = vi.fn();
    wrap(<HelpChat data={helpChatAssistantData} transcript={answeredTranscript} handlers={handlers({ onAsk })} now={now} />);
    const log = screen.getByRole('log', { name: 'Conversation with TasksNearMe Help' });
    expect(within(log).getByText(/Your card is charged when you book a helper/)).toBeDefined();
    expect(within(log).getAllByRole('listitem').length).toBeGreaterThan(2);
    expect(within(log).getByRole('link', { name: 'When am I charged?' }).getAttribute('href')).toBe(routes.help('when-am-i-charged'));
    expect(screen.getByText(/Answers come from an AI and can be wrong/)).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Can I change the time?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAsk).toHaveBeenCalledWith('Can I change the time?');
  });

  it('suggests a person when the answer needs staff, and opens the hand-off with the topic and the question filled in', async () => {
    const onHandOff = vi.fn(async () => ({ ok: true as const, code: 'submitted' as const }));
    wrap(<HelpChat data={helpChatAssistantData} transcript={suggestTranscript} handlers={handlers({ onHandOff })} now={now} />);
    expect(screen.getByText('This needs our support team.')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Talk to a person' })[0]!);
    const form = screen.getByRole('form', { name: 'Talk to a person' });
    expect((within(form).getByRole('combobox', { name: 'What is it about?' }) as HTMLSelectElement).value).toBe('booking');
    expect((within(form).getByRole('textbox', { name: 'What should our team know?' }) as HTMLTextAreaElement).value).toBe('My helper never showed up. Can I get my money back?');
    fireEvent.change(within(form).getByRole('combobox', { name: 'Booking' }), { target: { value: 'bkg_desk' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Send to support' }));
    await waitFor(() => expect(onHandOff).toHaveBeenCalledWith({ topic: 'booking', details: 'My helper never showed up. Can I get my money back?', bookingId: 'bkg_desk' }));
  });

  it('puts 911 first when someone may be in danger, and preselects Safety', () => {
    wrap(<HelpChat data={helpChatAssistantData} transcript={urgentTranscript} handlers={handlers()} now={now} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('If anyone is in danger, call 911 now.')).toBeDefined();
    fireEvent.click(within(alert).getByRole('button', { name: 'Talk to a person' }));
    expect((screen.getByRole('combobox', { name: 'What is it about?' }) as HTMLSelectElement).value).toBe('safety');
    expect(screen.getByText('Usually replies within 4 hours')).toBeDefined();
  });

  it('says when it is waiting for an answer, and offers Try again when one failed', () => {
    const onRetry = vi.fn();
    const { unmount } = wrap(<HelpChat data={helpChatAssistantData} transcript={pendingTranscript} handlers={handlers()} now={now} />);
    expect(screen.getAllByText('The assistant is writing…').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    wrap(<HelpChat data={helpChatAssistantData} transcript={failedTranscript} handlers={handlers({ onRetry })} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('without the assistant, still offers a person', () => {
    wrap(<HelpChat data={helpChatUnavailableData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.getByText(/The assistant isn't available right now/)).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeDefined();
  });

  it('shows the case once a person is on it: the chat, the request, then support, and replies to support', async () => {
    const onReply = vi.fn(async () => ({ ok: true as const, code: 'sent' as const }));
    const { unmount } = wrap(<HelpChat data={helpChatCaseWaitingData} transcript={emptyTranscript} handlers={handlers({ onReply })} now={now} />);
    expect(screen.getByText('Support team')).toBeDefined();
    expect(screen.getByText(/You're in line\. A person from our support team will reply here\. Usually within 24 hours\./)).toBeDefined();
    expect(screen.getByRole('link', { name: /Open in Support/ }).getAttribute('href')).toBe(routes.app.supportCase('case_help_1'));
    unmount();
    wrap(<HelpChat data={helpChatCaseRepliedData} transcript={emptyTranscript} handlers={handlers({ onReply })} now={now} />);
    expect(screen.getByText(/I'm Riley from support/)).toBeDefined();
    expect(screen.getByText('Support case: waiting for you')).toBeDefined();
    expect(screen.queryByText(/You're in line/)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message support' }), { target: { value: 'No message from Jordan.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onReply).toHaveBeenCalledWith({ body: 'No message from Jordan.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask the assistant something else' }));
    expect(screen.getByText('Your conversation with support is still open.')).toBeDefined();
  });

  it('notes a case that finished lately, and speaks Spanish', () => {
    wrap(<HelpChat data={helpChatRecentData} transcript={emptyTranscript} handlers={handlers()} now={now} />, 'es');
    expect(screen.getByText('Tu caso de soporte sobre Un pago está resuelto.')).toBeDefined();
    expect(screen.getByText(/¡Hola, Maya! Soy el asistente de TasksNearMe, una IA/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hablar con una persona' })).toBeDefined();
  });
});
