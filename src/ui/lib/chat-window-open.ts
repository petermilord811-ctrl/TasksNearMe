/**
 * Opening something in the chat window from code (2026-11-23, owner: "I hate to redirect to new pages continually"): a
 * Message button whose action answers with a conversation's address (a booking's, an offer's, a series') asks the
 * window first. The window takes it on wide screens, outside Messages' own pages (src/app/[locale]/(app)/app/_chat);
 * anywhere else nothing answers and the page goes there as before. Links don't need this: the window catches their
 * clicks itself.
 */
export const OPEN_IN_CHAT_EVENT = 'tnm:open-in-chat';

export interface OpenInChatDetail {
  href: string;
}

/** True when the chat window showed `href` (a conversation, Help or New message); false: navigate as usual. */
export function openInChatWindow(href: string): boolean {
  if (typeof window === 'undefined') return false;
  const event = new CustomEvent<OpenInChatDetail>(OPEN_IN_CHAT_EVENT, { detail: { href }, cancelable: true });
  return !window.dispatchEvent(event);
}
