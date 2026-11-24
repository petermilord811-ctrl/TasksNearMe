import type { ActionHandler } from './actions';
import type { HelpArticleData, HelpCenterData, LegalDocData } from './content';
import type { HelperProfilePageData } from './profiles';
import type { LegalDoc } from './routes';

// ---- Peeks: something to read beside the page, without leaving it (2026-11-23, owner: "I hate redirect … some buttons
// need new window instead of direct. or some buttons need sidebar or left/right/bottom navigator bar") ---------------
//
// On signed-in pages a plain click on a link to a helper's profile, a help article, the help center or a legal document
// opens it in a sheet: at the side on wide screens (the left one while a chat window is open, so the chat stays in view),
// from the bottom on phones. The page under it stays as it was, a draft included. "Open in new tab" leads to the page.

/** What a peek shows: a helper's profile, a help article (or the help center), or a legal document. */
export type PeekTarget = { kind: 'helper'; handle: string } | { kind: 'help'; slug?: string } | { kind: 'legal'; doc: LegalDoc };

/**
 * `GET /api/peek/helpers/[handle]`: the helper's profile as their public page shows it to this viewer, with what the
 * sheet's buttons need. 404: nobody by that handle the viewer may see.
 */
export interface HelperPeekData {
  profile: HelperProfilePageData;
  /** In the viewer's saved helpers. */
  saved: boolean;
  /** It's the viewer's own profile: no Message, Request or Save. */
  self: boolean;
}

/** `GET /api/peek/help?locale=` (the center) and `/api/peek/help/[slug]?locale=` (an article); 404: no such article. */
export type HelpPeekData = { kind: 'center'; data: HelpCenterData } | { kind: 'article'; data: HelpArticleData };

/** `GET /api/peek/legal/[doc]`: the document as its page shows it (English only, as there). */
export type LegalPeekData = LegalDocData;

/** What a peek loads, by its target. */
export type PeekData = { kind: 'helper'; data: HelperPeekData } | { kind: 'help'; data: HelpPeekData } | { kind: 'legal'; data: LegalPeekData };

/**
 * The sheet's buttons that change something (Server Actions handed over by the signed-in shell).
 * - `onToggleSaved`: save or remove the helper (`SavedHelperHandlers.onToggleSaved`): ok `updated`.
 */
export interface PeekHandlers {
  onToggleSaved: ActionHandler<{ helperId: string; saved: boolean }>;
}
