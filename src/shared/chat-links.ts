import type { ChatView, DirectChatTarget } from '@/contracts/messaging';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from './locale';

/** The longest id, handle or @username a link may name (anything longer names nobody). */
const TARGET_MAX = 80;

/**
 * Who a New message link names (`routes.app.newMessage`): `?helper=<handle>`, `?to=<userId>` or `?u=<username>`, in
 * that order; null when none is there (or what's there is blank or too long). Reads a URL's search, or a page's
 * `searchParams` (an array keeps its first value).
 */
export function directChatTargetOf(search: URLSearchParams | Record<string, string | string[] | undefined>): DirectChatTarget | null {
  const read = (name: string): string => {
    const value = search instanceof URLSearchParams ? search.get(name) : search[name];
    const first = Array.isArray(value) ? value[0] : value;
    const trimmed = typeof first === 'string' ? first.trim() : '';
    return trimmed.length <= TARGET_MAX ? trimmed : '';
  };
  const helper = read('helper');
  if (helper) return { helper };
  const userId = read('to');
  if (userId) return { userId };
  const username = read('u');
  return username ? { username } : null;
}

/** The same target, as a key (the window tells its views apart by it). */
export function directChatTargetKey(to: DirectChatTarget): string {
  return 'helper' in to ? `helper:${to.helper}` : 'userId' in to ? `to:${to.userId}` : `u:${to.username.toLowerCase()}`;
}

/**
 * Which chat window view a link opens: on wide screens a click on a link to a conversation (`/app/messages/<id>`, in
 * any language), to the Help conversation (`/app/messages/help`) or, since 2026-11-23 (owner: "I want to do it in live
 * chat box itself. I hate to redirect to new pages continually"), to New message (`/app/messages/new`, with the person
 * it names: a profile's or a post's Message) opens it in the chat window instead of leaving the page. Null for anything
 * else: other pages, other sites, and "Load earlier messages" (`?from=`).
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
  if (id === 'new') {
    const to = directChatTargetOf(url.searchParams);
    return to ? { kind: 'new', to } : { kind: 'new' };
  }
  if (id.length > TARGET_MAX) return null;
  return { kind: 'thread', threadId: id };
}

/** The page a chat window view opens on its own ("Open full page"). */
export function chatViewHref(view: ChatView): string {
  if (view.kind === 'help') return routes.app.helpChat();
  if (view.kind === 'thread') return routes.app.thread(view.threadId);
  if (view.kind === 'new') return routes.app.newMessage(view.to);
  return routes.app.messages();
}
