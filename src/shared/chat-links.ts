import type { ChatView } from '@/contracts/messaging';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from './locale';

/**
 * Which chat window view a link opens (2026-11-22): on wide screens a click on a link to a conversation
 * (`/app/messages/<id>`, in any language) or to the Help conversation (`/app/messages/help`) opens it in the chat window
 * instead of leaving the page. Null for anything else: other pages, other sites, "Load earlier messages" (`?from=`), and
 * starting a new conversation (`/app/messages/new`), which keep their pages.
 */
export function chatViewOfHref(href: string, origin: string): ChatView | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.searchParams.has('from')) return null;
  const path = (splitLocalePath(url.pathname)?.path ?? url.pathname).replace(/\/+$/, '');
  const match = /^\/app\/messages\/([^/]+)$/.exec(path);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  if (id === 'help') return { kind: 'help' };
  if (id === 'new' || id.length > 80) return null;
  return { kind: 'thread', threadId: id };
}

/** The page a chat window view opens on its own ("Open full page"). */
export function chatViewHref(view: ChatView): string {
  if (view.kind === 'help') return routes.app.helpChat();
  if (view.kind === 'thread') return routes.app.thread(view.threadId);
  return routes.app.messages();
}
