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
  helpChatLiveAgentData,
  helpChatLiveClosedData,
  helpChatLiveEndedData,
  helpChatLiveJoinedData,
  helpChatLiveOfflineData,
  helpChatLiveWaitingData,
  helpChatRateData,
  helpChatRatedData,
  helpChatRecentData,
  helpChatRecentRateData,
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

  it('suggests a person when the answer needs staff, and one tap connects them with the topic and the question', async () => {
    let finish: (result: { ok: true; code: 'submitted' }) => void = () => undefined;
    const onHandOff = vi.fn(() => new Promise<{ ok: true; code: 'submitted' }>((resolve) => { finish = resolve; }));
    wrap(<HelpChat data={helpChatAssistantData} transcript={suggestTranscript} handlers={handlers({ onHandOff })} now={now} />);
    expect(screen.getByText('This needs our support team.')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Talk to a person' })[0]!);
    expect(onHandOff).toHaveBeenCalledWith({ topic: 'booking', details: 'My helper never showed up. Can I get my money back?' });
    // No form in between: it says it's connecting until the app answers.
    expect(screen.queryByRole('form', { name: 'Talk to a person' })).toBeNull();
    expect(screen.getAllByText('Connecting you to a person…').length).toBeGreaterThan(0);
    finish({ ok: true, code: 'submitted' });
    await waitFor(() => expect(screen.queryAllByText('Connecting you to a person…').length).toBe(0));
  });

  it('puts 911 first when someone may be in danger, and connects them as a safety case', () => {
    const onHandOff = vi.fn(async () => ({ ok: true as const, code: 'submitted' as const }));
    wrap(<HelpChat data={helpChatAssistantData} transcript={urgentTranscript} handlers={handlers({ onHandOff })} now={now} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('If anyone is in danger, call 911 now.')).toBeDefined();
    fireEvent.click(within(alert).getByRole('button', { name: 'Talk to a person' }));
    expect(onHandOff).toHaveBeenCalledWith(expect.objectContaining({ topic: 'safety' }));
  });

  it('connects at once when they asked for a person in words, once per answer', async () => {
    const onHandOff = vi.fn(async () => ({ ok: true as const, code: 'submitted' as const }));
    const liveTurn = { ...suggestTranscript.turns[1]!, id: 'turn_live', question: 'I want to contact a live agent', answer: { text: 'Connecting you to a person from our support team.', sources: [], handoff: 'live' as const, topic: 'other' as const, summary: 'live agent' } };
    const { rerender } = wrap(<HelpChat data={helpChatAssistantData} transcript={{ turns: [liveTurn] }} handlers={handlers({ onHandOff })} now={now} />);
    await waitFor(() => expect(onHandOff).toHaveBeenCalledWith({ topic: 'other', details: 'I want to contact a live agent' }));
    rerender(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}><HelpChat data={helpChatAssistantData} transcript={{ turns: [liveTurn] }} handlers={handlers({ onHandOff })} now={now} /></NextIntlClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onHandOff).toHaveBeenCalledTimes(1);
  });

  it('says where they are in line while support is online, and that a reply comes here when no one is', () => {
    const { unmount } = wrap(<HelpChat data={helpChatLiveWaitingData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.getByRole('status').textContent).toContain("Connecting you to a person from support. You're number 2 in line.");
    expect(screen.queryByRole('button', { name: 'Chat live with support' })).toBeNull();
    expect(screen.queryByText(/You're in line\. A person from our support team will reply here/)).toBeNull();
    unmount();
    wrap(<HelpChat data={helpChatLiveOfflineData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.getByRole('status').textContent).toContain('No one from support is online right now.');
  });

  it('shows who joined the live chat in the header and the conversation, then that it ended', () => {
    const { unmount } = wrap(<HelpChat data={helpChatLiveJoinedData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.getByText('Riley · Support')).toBeDefined();
    expect(screen.getByText('Riley from support joined the chat.')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Message support' })).toBeDefined();
    unmount();
    wrap(<HelpChat data={helpChatLiveEndedData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.getByText('The live chat ended.')).toBeDefined();
    expect(screen.getByText(/The live chat ended\. You can still write here/)).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Message support' })).toBeDefined();
  });

  it('asks for a live chat on a case that has none, and tells the app they are typing', async () => {
    const onRequestLive = vi.fn(async () => ({ ok: true as const, code: 'updated' as const }));
    const onTyping = vi.fn();
    const onHandOff = vi.fn(async () => ({ ok: true as const, code: 'submitted' as const }));
    const { unmount } = wrap(<HelpChat data={helpChatCaseWaitingData} transcript={emptyTranscript} handlers={handlers({ onRequestLive, onTyping, onHandOff })} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat live with support' }));
    await waitFor(() => expect(onRequestLive).toHaveBeenCalledTimes(1));
    expect(onHandOff).not.toHaveBeenCalled();
    // Not live yet: typing isn't sent.
    fireEvent.change(screen.getByRole('textbox', { name: 'Message support' }), { target: { value: 'Hello' } });
    expect(onTyping).not.toHaveBeenCalled();
    unmount();
    wrap(<HelpChat data={helpChatLiveJoinedData} transcript={emptyTranscript} handlers={handlers({ onRequestLive, onTyping })} now={now} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message support' }), { target: { value: 'Hello' } });
    expect(onTyping).toHaveBeenCalled();
  });

  it('says why connecting failed', async () => {
    const onHandOff = vi.fn(async () => ({ ok: false as const, code: 'rate_limited' as const, retryAt: '2026-11-17T17:00:00.000Z' }));
    wrap(<HelpChat data={helpChatAssistantData} transcript={suggestTranscript} handlers={handlers({ onHandOff })} now={now} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Talk to a person' })[0]!);
    expect((await screen.findAllByRole('alert')).some((node) => /You've sent several requests\. Try again at/.test(node.textContent ?? ''))).toBe(true);
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

describe('HelpChat after the chat (2026-11-23: rating, the agent, transcripts, live chat hours)', () => {
  it('shows who from support is on the chat: their photo in the header, on the joined line and on their messages', () => {
    wrap(<HelpChat data={helpChatLiveAgentData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    const header = screen.getByRole('banner');
    // Their photo (or, where it can't load, their initial).
    expect(within(header).getByRole('img', { name: /Profile photo of Riley|Avatar with initials R/ })).toBeDefined();
    expect(within(header).getByText('Riley · Support')).toBeDefined();
    const log = screen.getByRole('log', { name: 'Conversation with TasksNearMe Help' });
    expect(within(log).getByText('Riley from support joined the chat.')).toBeDefined();
    // Their message is signed with their first name, not "Support".
    const message = within(log).getByText(/I'm Riley from support/).closest('article')!;
    expect(within(message).getByText('Riley')).toBeDefined();
    expect(within(log).getAllByRole('img', { name: /Profile photo of Riley|Avatar with initials R/ }).length).toBeGreaterThanOrEqual(2);
  });

  it('says live chat hours where a person is asked for, and outside them that the reply comes here and by email', () => {
    const { unmount } = wrap(<HelpChat data={helpChatAssistantData} transcript={suggestTranscript} handlers={handlers()} now={now} />);
    expect(screen.getAllByText(/Live chat is open now, until 6:00\s?pm Eastern Time\. Live chat with a person: Mon–Fri 9:00\s?am–6:00\s?pm, Sat 10:00\s?am–2:00\s?pm \(Eastern Time\)\./).length).toBe(2);
    unmount();
    wrap(<HelpChat data={helpChatLiveClosedData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    const waiting = screen.getByRole('status');
    expect(waiting.textContent).toMatch(/Live chat is closed now\. It opens Mon, Nov 23 · 9:00\s?am Eastern Time\. Leave your message here: we'll reply in this chat and by email\./);
    expect(screen.queryByText(/No one from support is online right now/)).toBeNull();
  });

  it('asks how the chat with Riley was once it ended: Good or Bad, an optional comment, then thanks', async () => {
    let finish: (result: { ok: true; code: 'saved' }) => void = () => undefined;
    const onRate = vi.fn(() => new Promise<{ ok: true; code: 'saved' }>((resolve) => { finish = resolve; }));
    wrap(<HelpChat data={helpChatRateData} transcript={emptyTranscript} handlers={handlers({ onRate })} now={now} />);
    const card = screen.getByRole('region', { name: 'How was your chat with Riley?' });
    fireEvent.click(within(card).getByRole('button', { name: 'Good' }));
    expect(within(card).getByRole('button', { name: 'Good' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(within(card).getByRole('textbox', { name: 'Anything to add? (optional)' }), { target: { value: 'Paused the payment at once.' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Send' }));
    expect(onRate).toHaveBeenCalledWith('case_help_1', { rating: 'good', comment: 'Paused the payment at once.' });
    expect(within(card).getByRole('button', { name: 'Sending…' })).toBeDefined();
    finish({ ok: true, code: 'saved' });
    await waitFor(() => expect(screen.getByText("Thanks! We're glad it helped.")).toBeDefined());
    expect(screen.getByRole('button', { name: 'Change' })).toBeDefined();
  });

  it('shows a rating given, with Change until a week after, and says why a rating fails', async () => {
    const onRate = vi.fn(async () => ({ ok: false as const, code: 'expired' as const }));
    wrap(<HelpChat data={helpChatRatedData} transcript={emptyTranscript} handlers={handlers({ onRate })} now={now} />);
    expect(screen.getByText('You rated this help good.')).toBeDefined();
    expect(screen.getByText('Riley paused the payment right away. Thank you!')).toBeDefined();
    expect(screen.getByText(/You can change it until/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const card = screen.getByRole('region', { name: 'How was your chat with Riley?' });
    expect((within(card).getByRole('textbox', { name: 'Anything to add? (optional)' }) as HTMLTextAreaElement).value).toBe('Riley paused the payment right away. Thank you!');
    fireEvent.click(within(card).getByRole('button', { name: 'Bad' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Send' }));
    expect(onRate).toHaveBeenCalledWith('case_help_1', { rating: 'bad', comment: 'Riley paused the payment right away. Thank you!' });
    await waitFor(() => expect(within(card).getByRole('alert').textContent).toBe("This rating can't be changed anymore."));
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('You rated this help good.')).toBeDefined();
  });

  it('emails the conversation to the member, and says where it went or why it did not', async () => {
    const onEmailTranscript = vi.fn(async () => ({ ok: true as const, code: 'sent' as const }));
    const { unmount } = wrap(<HelpChat data={helpChatRateData} transcript={emptyTranscript} handlers={handlers({ onEmailTranscript })} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Email me this conversation' }));
    expect(onEmailTranscript).toHaveBeenCalledWith('case_help_1');
    await waitFor(() => expect(screen.getByText('Sent to m•••@example.test.')).toBeDefined());
    unmount();
    const limited = vi.fn(async () => ({ ok: false as const, code: 'rate_limited' as const, retryAt: '2026-11-18T16:00:00.000Z' }));
    wrap(<HelpChat data={helpChatRateData} transcript={emptyTranscript} handlers={handlers({ onEmailTranscript: limited })} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Email me this conversation' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/You've emailed this conversation 3 times today\. Try again at/));
  });

  it('asks about a case solved lately from the assistant, and in Spanish', () => {
    const onRate = vi.fn(async () => ({ ok: true as const, code: 'saved' as const }));
    const { unmount } = wrap(<HelpChat data={helpChatRecentRateData} transcript={emptyTranscript} handlers={handlers({ onRate })} now={now} />);
    const card = screen.getByRole('region', { name: 'How did we do?' });
    fireEvent.click(within(card).getByRole('button', { name: 'Bad' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Send' }));
    expect(onRate).toHaveBeenCalledWith('case_help_0', { rating: 'bad' });
    unmount();
    wrap(<HelpChat data={helpChatRateData} transcript={emptyTranscript} handlers={handlers()} now={now} />, 'es');
    expect(screen.getByRole('region', { name: '¿Qué tal tu chat con Riley?' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Envíame esta conversación por correo' })).toBeDefined();
  });

  it('offers no rating without its handler or before there is help to rate', () => {
    wrap(<HelpChat data={helpChatLiveEndedData} transcript={emptyTranscript} handlers={handlers()} now={now} />);
    expect(screen.queryByRole('region', { name: /How (did we do|was your chat)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Email me this conversation' })).toBeNull();
  });
});
