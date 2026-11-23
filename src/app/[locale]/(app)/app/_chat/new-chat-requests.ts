import type { DirectChatStart, DirectChatTarget, PeopleSearchData } from '@/contracts';

/**
 * New message's reads (2026-11-23), for the chat window, the dialog and the New message page: the app's read routes,
 * never cached, signed in. Failures throw (the box keeps its last answer; the form offers Try again).
 */

/** Suggestions for what's typed in "To: @…" (`GET /api/messages/people`). */
export async function searchPeopleRequest(query: string): Promise<PeopleSearchData> {
  const response = await fetch(`/api/messages/people?q=${encodeURIComponent(query)}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`people ${response.status}`);
  return (await response.json()) as PeopleSearchData;
}

/** Where a conversation with someone starts (`GET /api/messages/new`); null when nobody reachable goes by that. */
export async function directChatStartRequest(to: DirectChatTarget): Promise<DirectChatStart | null> {
  const params = new URLSearchParams('helper' in to ? { helper: to.helper } : 'userId' in to ? { to: to.userId } : { u: to.username });
  const response = await fetch(`/api/messages/new?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`new ${response.status}`);
  return (await response.json()) as DirectChatStart;
}
