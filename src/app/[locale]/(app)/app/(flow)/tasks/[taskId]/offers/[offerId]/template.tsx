import { PageTransition } from '@/ui/shells/page-transition';

/**
 * Mounted afresh on every switch between this section's pages (its list, an item, the item's own pages), so those
 * switches move like the switches between sections do (plan 9.5; src/ui/theme/transitions.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
