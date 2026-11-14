/** Where the task list and map live on the page (the hero's cards scroll here). */
export const MAP_SECTION_ID = 'tasks-near-you';

/**
 * The landing page's sections that the footer's "On this page" index jumps back to, in page order. Each is the
 * `id` of its <section> (with a scroll margin for the top bar); the footer names them from `shell.footer.sections`.
 */
export const LANDING_SECTIONS = [MAP_SECTION_ID, 'how-it-works', 'pricing', 'trust', 'for-helpers', 'faq'] as const;
export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
