'use client';

import { useRouter } from 'next/navigation';
import type { ActionResult, HandOffInput, HelpChatData, ISODateTime, SupportReplyInput } from '@/contracts';
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
  actions: { handOff(input: HandOffInput): Promise<ActionResult>; reply(caseId: string, input: SupportReplyInput): Promise<ActionResult> };
}) {
  const router = useRouter();
  const helpChat = useHelpChat(viewerId, actions.handOff);
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
  }} />;
}
