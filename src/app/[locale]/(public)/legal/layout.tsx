import { withClientMessages } from '@/i18n/client-messages';
import { PeekController } from '../../_peek/peek-controller';

const READING = ['help', 'legal'] as const;

/**
 * The policies' pages (2026-11-23, owner: "I hate redirect … some buttons need sidebar … instead of redirect"): another
 * policy or a help article opens in a sheet beside the page instead of leaving it, as on signed-in pages and in the help
 * center; "Open in new tab" in the sheet leads to its page.
 */
function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    {children}
    <PeekController kinds={READING} />
  </>;
}

export default withClientMessages('[locale]/(public)/legal/layout.tsx', LegalLayout);
