import { withClientMessages } from '@/i18n/client-messages';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
import { SignedInPage } from '@/ui/lib/signed-in-page';

/**
 * Pages that open as a dialog over the page they're reached from, when they're reached from inside the site: report
 * something, save a search or edit one, and a booking's review, problem report, change and new proposal. The route
 * (.)app intercepts their /app URLs on a client navigation; loading the URL itself (a refresh, a link from an email)
 * still opens the full page under src/app/[locale]/(app). One frame for all of them, so moving from one to another keeps
 * it open. They're signed-in pages, so a failed action in them can mean the session ended (SignedInPage, J-N2).
 */
function RouteDialogLayout({ children }: { children: React.ReactNode }) {
  return <SignedInPage><RouteDialogFrame>{children}</RouteDialogFrame></SignedInPage>;
}

export default withClientMessages('[locale]/@modal/(.)app/layout.tsx', RouteDialogLayout);
