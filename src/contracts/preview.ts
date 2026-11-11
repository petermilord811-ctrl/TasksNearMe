import type { ReactNode } from 'react';

/**
 * One entry in the UI preview gallery (/dev/ui). Codex registers entries in
 * src/ui/previews/registry.ts; the app renders them and the test harness screenshots each one.
 */
export interface PreviewEntry {
  /** Stable, URL-safe id: "<group>/<variant>", e.g. "price-breakdown/desk-poster". */
  id: string;
  /** Gallery section, e.g. "Money". */
  group: string;
  title: string;
  /** Renders on the client. Components must be synchronous and isomorphic. */
  render: () => ReactNode;
  /** "padded" (default) wraps the preview in page padding; "fullscreen" for shells and whole screens. */
  layout?: 'padded' | 'fullscreen';
  /** Short note for reviewers (what to look at). */
  notes?: string;
}
