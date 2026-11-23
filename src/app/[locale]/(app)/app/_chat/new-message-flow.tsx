'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { routes, type ActionHandler, type ChatLoad, type DirectChatStart, type DirectChatTarget, type PeopleSearchData, type StartDirectChatInput } from '@/contracts';
import { NewChat } from '@/ui/components/messaging/new-chat';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { directChatStartRequest, searchPeopleRequest } from './new-chat-requests';

export interface NewMessageFlowProps {
  variant: 'dialog' | 'page';
  /** The person a link named, with what the server found for them (a username that belongs to nobody: `start` null). */
  initial?: { to: DirectChatTarget; start: DirectChatStart | null };
  initialSearch: PeopleSearchData;
  /** Server Action: the first message (`startDirectChatAction`). */
  onStart: ActionHandler<StartDirectChatInput>;
}

/**
 * New message on phones and on its own page (2026-11-23, owner: "I hate to redirect to new pages continually … if
 * possible, use dialog"): finding the person and writing to them happen in place (the old page asked the server again
 * for each @username). Choosing someone the viewer already talks to, or sending the first message, opens the
 * conversation's page.
 */
export function NewMessageFlow({ variant, initial, initialSearch, onStart }: NewMessageFlowProps) {
  const router = useRouter();
  const dialog = useRouteDialog();
  // To a conversation. From the dialog: closed first, then its page (the router would keep the dialog over a page its
  // slot has no route for), as the dialog does for its links.
  const leaveTo = (href: string) => {
    if (!dialog) {
      router.push(href);
      return;
    }
    window.addEventListener('popstate', () => router.push(href), { once: true });
    dialog.close({ done: true });
  };
  const [to, setTo] = useState<DirectChatTarget | undefined>(initial?.to);
  const [start, setStart] = useState<ChatLoad<DirectChatStart>>(
    !initial ? { status: 'idle' } : initial.start ? { status: 'ready', data: initial.start } : { status: 'error', notFound: true },
  );
  // The last person chosen wins: an earlier answer that comes back late is dropped.
  const turn = useRef(0);

  async function load(next: DirectChatTarget) {
    const mine = ++turn.current;
    setStart({ status: 'loading' });
    try {
      const data = await directChatStartRequest(next);
      if (mine !== turn.current) return;
      if (data?.kind === 'thread') {
        leaveTo(routes.app.thread(data.threadId));
        return;
      }
      setStart(data ? { status: 'ready', data } : { status: 'error', notFound: true });
    } catch {
      if (mine === turn.current) setStart({ status: 'error' });
    }
  }

  return <NewChat
    variant={variant}
    {...(to ? { to } : {})}
    start={start}
    initialSearch={initialSearch}
    handlers={{ onSearch: searchPeopleRequest, onStart }}
    onChoose={(next, person) => {
      if (person?.threadId) {
        leaveTo(routes.app.thread(person.threadId));
        return;
      }
      setTo(next);
      if (next) void load(next);
      else {
        turn.current += 1;
        setStart({ status: 'idle' });
      }
    }}
    onStarted={leaveTo}
    onRetry={() => { if (to) void load(to); }}
  />;
}
