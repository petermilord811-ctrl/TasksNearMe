import { PageTransition } from '@/ui/shells/page-transition';

/** Mounted afresh on every page switch in this group, so the switch moves (plan 9.5; src/ui/theme/transitions.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
