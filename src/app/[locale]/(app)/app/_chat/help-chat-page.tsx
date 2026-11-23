'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { ActionResult, HandOffInput, HelpChatData, ISODateTime, RateSupportInput, SupportReplyInput } from '@/contracts';
import { HelpChatScreen } from '@/ui/screens/messages/help-chat-screen';
import { useHelpChat } from './use-help-chat';

/**
 * The Help page's handlers (2026-11-22): the assistant's chat from the tab's storage (shared with the chat window), the
 * hand-off and replies to support through the Server Actions the page passes, then a refresh for the new case or reply.
 * Support's replies refresh the page through the live notice, like any page.
 */
export function HelpChatPage({ viewerId, data, now, actions }: {
  viewerId: string;
  data: HelpChatData;
  now: ISODateTime;
  actions: {
    handOff(input: HandOffInput): Promise<ActionResult>;
    reply(caseId: string, input: SupportReplyInput): Promise<ActionResult>;
    requestLive(caseId: string): Promise<ActionResult>;
    typing(caseId: string): Promise<void>;
    /** After the chat (2026-11-23): rating the help, and a copy of the conversation by email. */
    rate(caseId: string, input: RateSupportInput): Promise<ActionResult>;
    emailTranscript(caseId: string): Promise<ActionResult>;
  };
}) {
  const router = useRouter();
  const helpChat = useHelpChat(viewerId, actions.handOff);
  const caseId = data.case?.id;
  const waiting = data.case?.live?.state === 'waiting';
  // While waiting in line, the place in line moves as support joins others' chats: look again every 10 seconds.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [waiting, router]);
  const lastTyping = useRef(0);
  return <HelpChatScreen data={data} transcript={helpChat.transcript} now={now} handlers={{
    onAsk: (question) => void helpChat.ask(question),
    onRetry: helpChat.retry,
    onStartOver: helpChat.startOver,
    onHandOff: async (input) => {
      const result = await helpChat.handOff(input);
      if (result.ok) router.refresh();
      return result;
    },
    onReply: async (input) => {
      if (!data.case) return { ok: false, code: 'not_allowed' };
      const result = await actions.reply(data.case.id, input);
      if (result.ok) router.refresh();
      return result;
    },
    onRequestLive: async () => {
      if (!caseId) return { ok: false, code: 'not_allowed' };
      const result = await actions.requestLive(caseId);
      if (result.ok) router.refresh();
      return result;
    },
    onTyping: () => {
      if (!caseId || Date.now() - lastTyping.current < 2500) return;
      lastTyping.current = Date.now();
      void actions.typing(caseId).catch(() => undefined);
    },
    onRate: async (ratedCaseId, input) => {
      const result = await actions.rate(ratedCaseId, input);
      if (result.ok) router.refresh();
      return result;
    },
    onEmailTranscript: actions.emailTranscript,
  }} />;
}
