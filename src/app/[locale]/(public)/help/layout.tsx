import { withClientMessages } from '@/i18n/client-messages';
import { PeekController } from '../../_peek/peek-controller';

const READING = ['help', 'legal'] as const;

/**
 * The help center's pages (2026-11-23, owner: "I hate redirect … From the help center 'What to pay for a task near you'
 * button"): an article, a related one or a policy opens in a sheet beside the page instead of leaving it, as on
 * signed-in pages; "Open in new tab" in the sheet leads to its page. Breadcrumbs and the contact form still go to pages.
 */
function HelpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    {children}
    <PeekController kinds={READING} />
  </>;
}

export default withClientMessages('[locale]/(public)/help/layout.tsx', HelpLayout);
